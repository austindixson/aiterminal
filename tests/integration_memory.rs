use ferroclaw::memory::MemoryStore;

#[test]
fn test_memory_insert() {
    let mut store = MemoryStore::new();
    store.insert("key1".to_string(), "value1".to_string());
    let value = store.get("key1");
    assert_eq!(value, Some("value1".to_string()));
}

#[test]
fn test_memory_update() {
    let mut store = MemoryStore::new();
    store.insert("key1".to_string(), "value1".to_string());
    store.insert("key1".to_string(), "value2".to_string());
    let value = store.get("key1");
    assert_eq!(value, Some("value2".to_string()));
}