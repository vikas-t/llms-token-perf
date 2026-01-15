package graphlib

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Edge represents an edge in the graph
type Edge struct {
	From   string  `json:"from"`
	To     string  `json:"to"`
	Weight float64 `json:"weight"`
}

// Graph represents a graph data structure
type Graph struct {
	ID       string                       `json:"id"`
	Directed bool                         `json:"directed"`
	Weighted bool                         `json:"weighted"`
	Nodes    map[string]bool              `json:"nodes"`
	Adj      map[string]map[string]float64 `json:"adj"`
	InAdj    map[string]map[string]float64 `json:"in_adj"`
}

// PersistentData is the structure saved to disk
type PersistentData struct {
	Graphs map[string]*Graph `json:"graphs"`
	NextID int               `json:"next_id"`
}

// GraphStore stores all graphs with thread safety and persistence
type GraphStore struct {
	mu       sync.RWMutex
	graphs   map[string]*Graph
	nextID   int
	filepath string
}

var Store *GraphStore

func init() {
	Store = NewGraphStore()
}

// NewGraphStore creates a new graph store and loads from disk
func NewGraphStore() *GraphStore {
	homeDir, _ := os.UserHomeDir()
	fp := filepath.Join(homeDir, ".graphlib_store.json")

	s := &GraphStore{
		graphs:   make(map[string]*Graph),
		nextID:   1,
		filepath: fp,
	}
	s.load()
	return s
}

// load reads the store from disk
func (s *GraphStore) load() {
	data, err := os.ReadFile(s.filepath)
	if err != nil {
		return // File doesn't exist yet
	}
	var pd PersistentData
	if err := json.Unmarshal(data, &pd); err != nil {
		return
	}
	s.graphs = pd.Graphs
	if s.graphs == nil {
		s.graphs = make(map[string]*Graph)
	}
	s.nextID = pd.NextID
	if s.nextID < 1 {
		s.nextID = 1
	}
}

// save writes the store to disk
func (s *GraphStore) save() {
	pd := PersistentData{
		Graphs: s.graphs,
		NextID: s.nextID,
	}
	data, _ := json.Marshal(pd)
	os.WriteFile(s.filepath, data, 0644)
}

// GetGraph retrieves a graph by ID
func (s *GraphStore) GetGraph(id string) (*Graph, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[id]
	return g, ok
}

// AddGraph adds a graph to the store
func (s *GraphStore) AddGraph(g *Graph) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.graphs[g.ID] = g
	s.save()
}

// GenerateID generates a unique graph ID
func (s *GraphStore) GenerateID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := "graph-" + itoa(s.nextID)
	s.nextID++
	s.save()
	return id
}

// Save persists the current state (called after modifications)
func (s *GraphStore) Save() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.save()
}

// itoa converts int to string without importing strconv
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	result := ""
	for n > 0 {
		result = string(rune('0'+n%10)) + result
		n /= 10
	}
	return result
}
