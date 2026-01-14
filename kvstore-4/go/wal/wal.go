package wal

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Operation represents a WAL entry
type Operation struct {
	Op        string      `json:"op"`
	Key       string      `json:"key"`
	Value     interface{} `json:"value,omitempty"`
	TTL       *int        `json:"ttl,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

// WAL manages the write-ahead log
type WAL struct {
	mu       sync.Mutex
	file     *os.File
	filePath string
}

// NewWAL creates a new WAL instance
func NewWAL(dataDir string) (*WAL, error) {
	// Create data directory if it doesn't exist
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	filePath := filepath.Join(dataDir, "wal.log")
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	return &WAL{
		file:     file,
		filePath: filePath,
	}, nil
}

// Append writes an operation to the WAL
func (w *WAL) Append(op string, key string, value interface{}, ttl *int) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	operation := Operation{
		Op:        op,
		Key:       key,
		Value:     value,
		TTL:       ttl,
		Timestamp: time.Now().Unix(),
	}

	data, err := json.Marshal(operation)
	if err != nil {
		return err
	}

	data = append(data, '\n')
	_, err = w.file.Write(data)
	if err != nil {
		return err
	}

	// Sync to ensure data is written to disk
	return w.file.Sync()
}

// Replay reads and replays all operations from the WAL
func (w *WAL) Replay() ([]Operation, error) {
	file, err := os.Open(w.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Operation{}, nil
		}
		return nil, err
	}
	defer file.Close()

	var operations []Operation
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		var op Operation
		if err := json.Unmarshal(scanner.Bytes(), &op); err != nil {
			continue // Skip malformed lines
		}
		operations = append(operations, op)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return operations, nil
}

// Close closes the WAL file
func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.file.Close()
}
