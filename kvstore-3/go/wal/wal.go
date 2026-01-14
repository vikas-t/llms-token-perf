package wal

import (
	"bufio"
	"encoding/json"
	"os"
	"sync"
	"time"
)

// LogEntry represents a single WAL entry
type LogEntry struct {
	Op        string      `json:"op"`
	Key       string      `json:"key"`
	Value     interface{} `json:"value,omitempty"`
	TTL       *int        `json:"ttl,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

// WAL manages write-ahead logging
type WAL struct {
	mu       sync.Mutex
	file     *os.File
	writer   *bufio.Writer
	filePath string
}

// NewWAL creates a new WAL instance
func NewWAL(filePath string) (*WAL, error) {
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	return &WAL{
		file:     file,
		writer:   bufio.NewWriter(file),
		filePath: filePath,
	}, nil
}

// LogSet logs a set operation
func (w *WAL) LogSet(key string, value interface{}, ttl *int) error {
	return w.logEntry(&LogEntry{
		Op:        "set",
		Key:       key,
		Value:     value,
		TTL:       ttl,
		Timestamp: time.Now().Unix(),
	})
}

// LogDelete logs a delete operation
func (w *WAL) LogDelete(key string) error {
	return w.logEntry(&LogEntry{
		Op:        "delete",
		Key:       key,
		Timestamp: time.Now().Unix(),
	})
}

func (w *WAL) logEntry(entry *LogEntry) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	if _, err := w.writer.Write(data); err != nil {
		return err
	}

	if _, err := w.writer.WriteString("\n"); err != nil {
		return err
	}

	// Flush to ensure durability
	return w.writer.Flush()
}

// Replay reads and returns all log entries
func (w *WAL) Replay() ([]*LogEntry, error) {
	// Close current writer and reopen for reading
	file, err := os.Open(w.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []*LogEntry{}, nil
		}
		return nil, err
	}
	defer file.Close()

	entries := []*LogEntry{}
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var entry LogEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			// Skip malformed entries
			continue
		}

		entries = append(entries, &entry)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return entries, nil
}

// Close closes the WAL file
func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if err := w.writer.Flush(); err != nil {
		return err
	}

	return w.file.Close()
}
