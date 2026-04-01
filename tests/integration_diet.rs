use ferroclaw::mcp::Diet;

#[test]
fn test_diet_optimization() {
    let mut diet = Diet::new();
    let result = diet.optimize("test input");
    assert!(result.is_some());
}

#[test]
fn test_diet_compression() {
    let mut diet = Diet::new();
    let result = diet.compress("test input".to_string());
    assert!(!result.is_empty());
}