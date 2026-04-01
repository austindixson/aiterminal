use ferroclaw::provider::Provider;

#[test]
fn test_provider_creation() {
    let provider = Provider::new("test");
    assert_eq!(provider.name, "test");
}

#[test]
fn test_provider_generate() {
    let provider = Provider::new("test");
    let result = provider.generate("test prompt", None);
    assert!(result.is_ok());
}