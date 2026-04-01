use ferroclaw::security::SecurityAudit;

#[test]
fn test_audit_creation() {
    let audit = SecurityAudit::new();
    assert!(audit.is_ok());
}

#[test]
fn test_audit_scanning() {
    let audit = SecurityAudit::new();
    let result = audit.scan("test code");
    assert!(result.is_ok());
}