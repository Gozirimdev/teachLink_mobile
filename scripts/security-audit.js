const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const HIGH_CRITICAL_ALLOWLIST = {
  axios:
    'npm advisory currently recommends a breaking downgrade because patched form-data 4.x is not published yet.',
  'form-data':
    'Tracked via axios/jsdom advisories; patched form-data 4.x is not available in npm yet.',
  'jest-environment-jsdom':
    'Dev/test-only chain; npm advisory recommends a breaking Jest downgrade.',
  'jest-expo': 'Dev/test-only chain; npm advisory recommends a breaking Expo Jest downgrade.',
  jsdom: 'Dev/test-only chain; blocked on patched form-data 4.x availability.',
  undici: 'Expo CLI transitive dependency; npm advisory fix requires an Expo major upgrade.',
};

function runAudit() {
  console.log('Running npm audit...');

  exec('npm audit --json', { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
    // npm audit returns non-zero exit code if vulnerabilities are found.
    // We ignore the error object and just parse the stdout.

    if (!stdout) {
      console.error('Failed to get stdout from npm audit');
      if (stderr) console.error(stderr);
      process.exit(1);
    }

    let auditData;
    try {
      auditData = JSON.parse(stdout);
    } catch (parseError) {
      console.error('Failed to parse npm audit output:', parseError);
      console.error('Stdout was:', stdout.slice(0, 500) + '...');
      process.exit(1);
    }

    processAuditData(auditData);
  });
}

function processAuditData(data) {
  const metadata = data.metadata || {};
  const vulnerabilities = metadata.vulnerabilities || {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  };
  const dependencies = metadata.dependencies || {};

  const allVulns = data.vulnerabilities || {};
  const highOrCriticalVulns = Object.values(allVulns).filter(
    v => v.severity === 'high' || v.severity === 'critical'
  );
  const blockingVulns = highOrCriticalVulns.filter(v => !HIGH_CRITICAL_ALLOWLIST[v.name]);
  const allowedVulns = highOrCriticalVulns.filter(v => HIGH_CRITICAL_ALLOWLIST[v.name]);
  const hasHighOrCritical = blockingVulns.length > 0;

  // Build Markdown Report
  let report = '## 🛡️ Security Dependency Audit Report\n\n';

  if (hasHighOrCritical) {
    report += '❌ **FAILED:** High or Critical vulnerabilities found!\n\n';
  } else {
    report += '✅ **PASSED:** No High or Critical vulnerabilities found.\n\n';
  }

  report += '### 📊 Summary\n';
  report += '| Severity | Count |\n';
  report += '| -------- | ----- |\n';
  report += `| 🛑 Critical | ${vulnerabilities.critical} |\n`;
  report += `| 🔴 High     | ${vulnerabilities.high} |\n`;
  report += `| 🟠 Moderate | ${vulnerabilities.moderate} |\n`;
  report += `| 🟡 Low      | ${vulnerabilities.low} |\n`;
  report += `| 🔵 Info     | ${vulnerabilities.info} |\n`;
  report += `| **Total**   | **${vulnerabilities.total}** |\n\n`;

  report += `**Total Dependencies Scanned:** ${dependencies.total || 0}\n\n`;

  if (allowedVulns.length > 0) {
    report += '### Temporarily Allowed High/Critical Advisories\n\n';
    allowedVulns.forEach(vuln => {
      report += `- **${vuln.name} (${vuln.severity.toUpperCase()}):** ${HIGH_CRITICAL_ALLOWLIST[vuln.name]}\n`;
    });
    report += '\n';
  }

  if (vulnerabilities.total > 0) {
    report += '### 🚨 Vulnerability Details & Remediation\n\n';

    const detailedVulns = blockingVulns;

    if (detailedVulns.length > 0) {
      detailedVulns.forEach(vuln => {
        report += `#### ${vuln.name} (${vuln.severity.toUpperCase()})\n`;
        report += `- **Vulnerable Versions:** ${vuln.range}\n`;
        if (vuln.fixAvailable) {
          if (typeof vuln.fixAvailable === 'boolean') {
            report += `- **Remediation:** Run \`npm audit fix\`\n`;
          } else {
            report += `- **Remediation:** Update to ${vuln.fixAvailable.name}@${vuln.fixAvailable.version} (Warning: may be a breaking change)\n`;
          }
        } else {
          report += `- **Remediation:** No direct fix available. Consider updating dependent packages or investigating alternative packages.\n`;
        }
        report += `\n`;
      });
    } else {
      report +=
        'No High or Critical vulnerabilities to display details for. Run `npm audit` locally for lower severity details.\n\n';
    }

    report +=
      '---\n💡 **Tip:** Run `npm audit fix` locally to automatically resolve compatible vulnerabilities.\n';
  }

  // Output to GitHub Step Summary if running in Actions
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, report);
      console.log('Report written to GitHub Step Summary.');
    } catch (err) {
      console.error('Failed to write to GitHub Step Summary:', err);
    }
  }

  // Output to console
  console.log(report);

  if (hasHighOrCritical) {
    console.error('Build failed due to high or critical vulnerabilities.');
    process.exit(1);
  } else {
    console.log('Security audit passed.');
    process.exit(0);
  }
}

runAudit();
