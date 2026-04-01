use ferroclaw::types::MessageType;

#[test]
fn test_message_type_creation() {
    let msg = MessageType::Chat("test".to_string());
    assert_eq!(msg.to_string(), "test");
}

#[test]
fn test_message_type_format() {
    let msg = MessageType::Chat("test".to_string());
    let formatted = msg.to_string();
    assert!(!formatted.is_empty());
}