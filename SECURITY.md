# Security Policy

## Supported Versions

Currently, we support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of @btc-stamps/tx-builder seriously. If you discover a security vulnerability, please follow these steps:

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Report vulnerabilities through GitHub's private vulnerability reporting:
   - Navigate to the [Security tab](https://github.com/btc-stamps/tx-builder/security)
   - Click "Report a vulnerability"
   - Provide detailed information about the vulnerability

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if you have one)
- Your contact information for follow-up questions

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 5 business days
- **Resolution Target**: Critical issues within 7 days, others within 30 days

### Security Update Process

1. Security patches will be developed on a private branch
2. Updates will be tested thoroughly before release
3. Security advisories will be published after the patch is available
4. All users will be notified through GitHub security advisories

## Security Best Practices

When using @btc-stamps/tx-builder:

1. **Keep Dependencies Updated**: Regularly update to the latest version
2. **Private Keys**: Never expose private keys in logs or error messages
3. **Input Validation**: Always validate transaction inputs
4. **Network Selection**: Ensure correct network (mainnet/testnet) selection
5. **Fee Calculation**: Verify fee calculations before broadcasting

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who report valid vulnerabilities (with their permission).

Thank you for helping keep @btc-stamps/tx-builder secure!