package main

import (
	"flag"
	"kvstore/server"
	"kvstore/store"
	"kvstore/wal"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	// Parse command-line flags
	port := flag.String("port", "", "HTTP server port")
	dataDir := flag.String("data-dir", "", "Directory for data storage")
	flag.Parse()

	// Get configuration from flags or environment variables
	serverPort := *port
	if serverPort == "" {
		serverPort = os.Getenv("PORT")
	}
	if serverPort == "" {
		serverPort = "8080"
	}

	dataDirPath := *dataDir
	if dataDirPath == "" {
		dataDirPath = os.Getenv("DATA_DIR")
	}
	if dataDirPath == "" {
		dataDirPath = "./data"
	}

	// Initialize KVStore
	kvstore := store.NewKVStore()

	// Initialize WAL
	walInstance, err := wal.NewWAL(dataDirPath)
	if err != nil {
		log.Fatalf("Failed to initialize WAL: %v", err)
	}
	defer walInstance.Close()

	// Replay WAL to restore state
	operations, err := walInstance.Replay()
	if err != nil {
		log.Fatalf("Failed to replay WAL: %v", err)
	}

	log.Printf("Replaying %d operations from WAL", len(operations))
	for _, op := range operations {
		switch op.Op {
		case "set":
			// Check if TTL has already expired
			if op.TTL != nil && *op.TTL > 0 {
				expiresAt := time.Unix(op.Timestamp, 0).Add(time.Duration(*op.TTL) * time.Second)
				if time.Now().After(expiresAt) {
					// Already expired, skip
					continue
				}
				// Calculate remaining TTL
				remainingTTL := int(time.Until(expiresAt).Seconds())
				kvstore.Set(op.Key, op.Value, &remainingTTL)
			} else {
				kvstore.Set(op.Key, op.Value, op.TTL)
			}
		case "delete":
			kvstore.Delete(op.Key)
		}
	}

	// Start TTL cleanup goroutine
	kvstore.StartTTLCleanup(5 * time.Second)

	// Initialize server
	srv := server.NewServer(kvstore, walInstance)

	// Set up routes
	http.HandleFunc("/stats", srv.HandleStats)
	http.HandleFunc("/kv/batch", srv.HandleBatch)
	http.HandleFunc("/kv/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			if r.URL.Path == "/kv" || r.URL.Path == "/kv/" {
				srv.HandleListKeys(w, r)
			} else {
				srv.HandleGet(w, r)
			}
		case http.MethodPut:
			srv.HandlePut(w, r)
		case http.MethodDelete:
			srv.HandleDelete(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Start server
	addr := ":" + serverPort
	log.Printf("Starting KVStore server on %s", addr)
	log.Printf("Data directory: %s", dataDirPath)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
