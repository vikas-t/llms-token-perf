package lib

import (
	"sort"
)

// CreateGraph creates a new graph with the given options
func CreateGraph(directed, weighted bool) *Graph {
	g := &Graph{
		ID:       GenerateID(),
		Directed: directed,
		Weighted: weighted,
		Nodes:    make(map[string]bool),
		Adj:      make(map[string]map[string]float64),
		InEdges:  make(map[string]map[string]float64),
	}
	GetStore().Save(g)
	return g
}

// AddNode adds a node to the graph
func (g *Graph) AddNode(nodeID string) (bool, string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.Nodes[nodeID] {
		return false, "node_already_exists"
	}
	g.Nodes[nodeID] = true
	if g.Adj[nodeID] == nil {
		g.Adj[nodeID] = make(map[string]float64)
	}
	if g.Directed && g.InEdges[nodeID] == nil {
		g.InEdges[nodeID] = make(map[string]float64)
	}
	GetStore().Save(g)
	return true, ""
}

// AddEdge adds an edge between two nodes
func (g *Graph) AddEdge(from, to string, weight float64) (bool, string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Auto-create nodes if they don't exist
	if !g.Nodes[from] {
		g.Nodes[from] = true
		g.Adj[from] = make(map[string]float64)
		if g.Directed {
			g.InEdges[from] = make(map[string]float64)
		}
	}
	if !g.Nodes[to] {
		g.Nodes[to] = true
		g.Adj[to] = make(map[string]float64)
		if g.Directed {
			g.InEdges[to] = make(map[string]float64)
		}
	}

	// Check if edge already exists
	if _, exists := g.Adj[from][to]; exists {
		return false, "edge_already_exists"
	}

	// For undirected graphs, also check reverse direction
	if !g.Directed {
		if _, exists := g.Adj[to][from]; exists {
			return false, "edge_already_exists"
		}
	}

	// Add the edge
	g.Adj[from][to] = weight
	if g.Directed {
		g.InEdges[to][from] = weight
	} else {
		// For undirected graphs, add edge in both directions
		g.Adj[to][from] = weight
	}

	GetStore().Save(g)
	return true, ""
}

// RemoveNode removes a node and all its incident edges
func (g *Graph) RemoveNode(nodeID string) (bool, string, int) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if !g.Nodes[nodeID] {
		return false, "node_not_found", 0
	}

	removedEdges := 0

	// Count and remove outgoing edges
	if edges, exists := g.Adj[nodeID]; exists {
		removedEdges += len(edges)
		for to := range edges {
			if g.Directed {
				delete(g.InEdges[to], nodeID)
			} else {
				// For undirected, don't double-count self-loops
				if to != nodeID {
					delete(g.Adj[to], nodeID)
				}
			}
		}
	}

	// For directed graphs, count and remove incoming edges
	if g.Directed {
		if edges, exists := g.InEdges[nodeID]; exists {
			for from := range edges {
				if from != nodeID { // Don't double-count self-loops
					removedEdges++
					delete(g.Adj[from], nodeID)
				}
			}
		}
		delete(g.InEdges, nodeID)
	}

	delete(g.Adj, nodeID)
	delete(g.Nodes, nodeID)

	GetStore().Save(g)
	return true, "", removedEdges
}

// RemoveEdge removes an edge between two nodes
func (g *Graph) RemoveEdge(from, to string) (bool, string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, exists := g.Adj[from][to]; !exists {
		// For undirected graphs, check reverse direction
		if !g.Directed {
			if _, exists := g.Adj[to][from]; exists {
				delete(g.Adj[to], from)
				delete(g.Adj[from], to)
				GetStore().Save(g)
				return true, ""
			}
		}
		return false, "edge_not_found"
	}

	delete(g.Adj[from], to)
	if g.Directed {
		delete(g.InEdges[to], from)
	} else {
		delete(g.Adj[to], from)
	}

	GetStore().Save(g)
	return true, ""
}

// GetNodes returns all nodes in the graph
func (g *Graph) GetNodes() []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	nodes := make([]string, 0, len(g.Nodes))
	for n := range g.Nodes {
		nodes = append(nodes, n)
	}
	sort.Strings(nodes)
	return nodes
}

// GetEdges returns all edges in the graph
func (g *Graph) GetEdges() []Edge {
	g.mu.RLock()
	defer g.mu.RUnlock()

	edges := make([]Edge, 0)
	seen := make(map[string]bool)

	for from := range g.Adj {
		for to, weight := range g.Adj[from] {
			if g.Directed {
				edges = append(edges, Edge{From: from, To: to, Weight: weight})
			} else {
				// For undirected, only add each edge once
				key := from + "-" + to
				reverseKey := to + "-" + from
				if !seen[key] && !seen[reverseKey] {
					seen[key] = true
					edges = append(edges, Edge{From: from, To: to, Weight: weight})
				}
			}
		}
	}

	// Sort edges for deterministic output
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].From != edges[j].From {
			return edges[i].From < edges[j].From
		}
		return edges[i].To < edges[j].To
	})

	return edges
}

// GetNeighbors returns all neighbors of a node
func (g *Graph) GetNeighbors(nodeID string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	neighbors := make([]string, 0)
	if edges, exists := g.Adj[nodeID]; exists {
		for to := range edges {
			neighbors = append(neighbors, to)
		}
	}
	sort.Strings(neighbors)
	return neighbors
}

// HasNode checks if a node exists
func (g *Graph) HasNode(nodeID string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.Nodes[nodeID]
}

// HasEdge checks if an edge exists and returns its weight
func (g *Graph) HasEdge(from, to string) (bool, float64) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if weight, exists := g.Adj[from][to]; exists {
		return true, weight
	}
	return false, 0
}

// GetDegree returns the degree of a node
func (g *Graph) GetDegree(nodeID string) (int, int, int) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if !g.Nodes[nodeID] {
		return 0, 0, 0
	}

	outDegree := len(g.Adj[nodeID])

	if g.Directed {
		inDegree := len(g.InEdges[nodeID])
		return inDegree + outDegree, inDegree, outDegree
	}

	// For undirected, in_degree = out_degree = degree
	return outDegree, outDegree, outDegree
}

// NodeCount returns the number of nodes
func (g *Graph) NodeCount() int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return len(g.Nodes)
}

// EdgeCount returns the number of edges
func (g *Graph) EdgeCount() int {
	g.mu.RLock()
	defer g.mu.RUnlock()

	count := 0
	for _, edges := range g.Adj {
		count += len(edges)
	}

	if !g.Directed {
		count /= 2
	}
	return count
}

// Clear removes all nodes and edges
func (g *Graph) Clear() {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.Nodes = make(map[string]bool)
	g.Adj = make(map[string]map[string]float64)
	g.InEdges = make(map[string]map[string]float64)
	GetStore().Save(g)
}

// Clone creates a copy of the graph
func (g *Graph) Clone() *Graph {
	g.mu.RLock()
	defer g.mu.RUnlock()

	newGraph := &Graph{
		ID:       GenerateID(),
		Directed: g.Directed,
		Weighted: g.Weighted,
		Nodes:    make(map[string]bool),
		Adj:      make(map[string]map[string]float64),
		InEdges:  make(map[string]map[string]float64),
	}

	for n := range g.Nodes {
		newGraph.Nodes[n] = true
	}

	for from, edges := range g.Adj {
		newGraph.Adj[from] = make(map[string]float64)
		for to, weight := range edges {
			newGraph.Adj[from][to] = weight
		}
	}

	if g.Directed {
		for to, edges := range g.InEdges {
			newGraph.InEdges[to] = make(map[string]float64)
			for from, weight := range edges {
				newGraph.InEdges[to][from] = weight
			}
		}
	}

	GetStore().Save(newGraph)
	return newGraph
}

// Subgraph creates a subgraph with only the specified nodes
func (g *Graph) Subgraph(nodeIDs []string) *Graph {
	g.mu.RLock()
	defer g.mu.RUnlock()

	newGraph := &Graph{
		ID:       GenerateID(),
		Directed: g.Directed,
		Weighted: g.Weighted,
		Nodes:    make(map[string]bool),
		Adj:      make(map[string]map[string]float64),
		InEdges:  make(map[string]map[string]float64),
	}

	// Add only the specified nodes that exist
	nodeSet := make(map[string]bool)
	for _, n := range nodeIDs {
		if g.Nodes[n] {
			nodeSet[n] = true
			newGraph.Nodes[n] = true
			newGraph.Adj[n] = make(map[string]float64)
			if g.Directed {
				newGraph.InEdges[n] = make(map[string]float64)
			}
		}
	}

	// Add edges between the selected nodes
	for from := range nodeSet {
		if edges, exists := g.Adj[from]; exists {
			for to, weight := range edges {
				if nodeSet[to] {
					newGraph.Adj[from][to] = weight
					if g.Directed {
						newGraph.InEdges[to][from] = weight
					}
				}
			}
		}
	}

	GetStore().Save(newGraph)
	return newGraph
}

// GetGraphInfo returns metadata about the graph
func (g *Graph) GetGraphInfo() map[string]interface{} {
	g.mu.RLock()
	nodeCount := len(g.Nodes)
	edgeCount := 0
	for _, edges := range g.Adj {
		edgeCount += len(edges)
	}
	if !g.Directed {
		edgeCount /= 2
	}
	g.mu.RUnlock()

	isConnected := g.IsConnected()
	hasCycle, _ := g.HasCycle()

	return map[string]interface{}{
		"id":           g.ID,
		"directed":     g.Directed,
		"weighted":     g.Weighted,
		"node_count":   nodeCount,
		"edge_count":   edgeCount,
		"is_connected": isConnected,
		"has_cycle":    hasCycle,
	}
}
