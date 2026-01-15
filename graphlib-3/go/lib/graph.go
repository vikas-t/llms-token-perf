package graphlib

import (
	"sort"
)

// CreateGraph creates a new graph
func CreateGraph(directed, weighted bool) map[string]interface{} {
	id := Store.GenerateID()
	g := &Graph{
		ID:       id,
		Directed: directed,
		Weighted: weighted,
		Nodes:    make(map[string]bool),
		Adj:      make(map[string]map[string]float64),
		InAdj:    make(map[string]map[string]float64),
	}
	Store.AddGraph(g)
	return map[string]interface{}{
		"id":         id,
		"directed":   directed,
		"weighted":   weighted,
		"node_count": 0,
		"edge_count": 0,
	}
}

// AddNode adds a node to the graph
func AddNode(graphID, nodeID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	if g.Nodes[nodeID] {
		return map[string]interface{}{"success": false, "error": "node_already_exists"}
	}
	g.Nodes[nodeID] = true
	if g.Adj[nodeID] == nil {
		g.Adj[nodeID] = make(map[string]float64)
	}
	if g.InAdj[nodeID] == nil {
		g.InAdj[nodeID] = make(map[string]float64)
	}
	Store.Save()
	return map[string]interface{}{"success": true, "node_id": nodeID}
}

// AddEdge adds an edge to the graph
func AddEdge(graphID, from, to string, weight *float64) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}

	// Auto-create nodes if they don't exist
	if !g.Nodes[from] {
		g.Nodes[from] = true
		g.Adj[from] = make(map[string]float64)
		g.InAdj[from] = make(map[string]float64)
	}
	if !g.Nodes[to] {
		g.Nodes[to] = true
		g.Adj[to] = make(map[string]float64)
		g.InAdj[to] = make(map[string]float64)
	}

	// Check if edge already exists
	if _, exists := g.Adj[from][to]; exists {
		return map[string]interface{}{"success": false, "error": "edge_already_exists"}
	}

	w := 1.0
	if weight != nil {
		w = *weight
	}

	// Add edge
	g.Adj[from][to] = w
	g.InAdj[to][from] = w

	// For undirected, add reverse edge
	if !g.Directed {
		g.Adj[to][from] = w
		g.InAdj[from][to] = w
	}

	Store.Save()
	return map[string]interface{}{"success": true, "from": from, "to": to, "weight": w}
}

// RemoveNode removes a node and all its incident edges
func RemoveNode(graphID, nodeID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	if !g.Nodes[nodeID] {
		return map[string]interface{}{"success": false, "error": "node_not_found"}
	}

	removedEdges := 0

	// For undirected graphs, we need to count edges once (not twice)
	// and remove from both Adj and InAdj of neighbors
	if g.Directed {
		// Directed: count outgoing edges
		for neighbor := range g.Adj[nodeID] {
			delete(g.InAdj[neighbor], nodeID)
			removedEdges++
		}
		// Directed: count incoming edges
		for neighbor := range g.InAdj[nodeID] {
			if neighbor != nodeID { // Don't double count self-loop
				delete(g.Adj[neighbor], nodeID)
				removedEdges++
			}
		}
	} else {
		// Undirected: edges are stored in both directions, count once
		for neighbor := range g.Adj[nodeID] {
			delete(g.InAdj[neighbor], nodeID)
			delete(g.Adj[neighbor], nodeID)
			removedEdges++
		}
	}

	delete(g.Nodes, nodeID)
	delete(g.Adj, nodeID)
	delete(g.InAdj, nodeID)

	Store.Save()
	return map[string]interface{}{"success": true, "removed_edges": removedEdges}
}

// RemoveEdge removes an edge from the graph
func RemoveEdge(graphID, from, to string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}

	if _, exists := g.Adj[from][to]; !exists {
		return map[string]interface{}{"success": false, "error": "edge_not_found"}
	}

	delete(g.Adj[from], to)
	delete(g.InAdj[to], from)

	if !g.Directed {
		delete(g.Adj[to], from)
		delete(g.InAdj[from], to)
	}

	Store.Save()
	return map[string]interface{}{"success": true}
}

// GetNodes returns all nodes in the graph
func GetNodes(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"nodes": []string{}, "count": 0}
	}

	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	return map[string]interface{}{"nodes": nodes, "count": len(nodes)}
}

// GetEdges returns all edges in the graph
func GetEdges(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"edges": []Edge{}, "count": 0}
	}

	edges := []Edge{}
	seen := make(map[string]bool)

	// Get sorted nodes for deterministic order
	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	for _, from := range nodes {
		// Get sorted neighbors
		neighbors := make([]string, 0, len(g.Adj[from]))
		for to := range g.Adj[from] {
			neighbors = append(neighbors, to)
		}
		sort.Strings(neighbors)

		for _, to := range neighbors {
			weight := g.Adj[from][to]
			key := from + "->" + to
			reverseKey := to + "->" + from

			if !g.Directed {
				// For undirected, only add edge once
				if !seen[key] && !seen[reverseKey] {
					edges = append(edges, Edge{From: from, To: to, Weight: weight})
					seen[key] = true
				}
			} else {
				edges = append(edges, Edge{From: from, To: to, Weight: weight})
			}
		}
	}

	return map[string]interface{}{"edges": edges, "count": len(edges)}
}

// GetNeighbors returns neighbors of a node
func GetNeighbors(graphID, nodeID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"neighbors": []string{}, "count": 0}
	}

	neighbors := make([]string, 0)
	for neighbor := range g.Adj[nodeID] {
		neighbors = append(neighbors, neighbor)
	}
	sort.Strings(neighbors)

	return map[string]interface{}{"neighbors": neighbors, "count": len(neighbors)}
}

// HasNode checks if a node exists
func HasNode(graphID, nodeID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"exists": false}
	}
	return map[string]interface{}{"exists": g.Nodes[nodeID]}
}

// HasEdge checks if an edge exists
func HasEdge(graphID, from, to string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"exists": false}
	}
	weight, exists := g.Adj[from][to]
	if !exists {
		return map[string]interface{}{"exists": false}
	}
	return map[string]interface{}{"exists": true, "weight": weight}
}

// GetDegree returns the degree of a node
func GetDegree(graphID, nodeID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"degree": 0, "in_degree": 0, "out_degree": 0}
	}

	outDegree := len(g.Adj[nodeID])
	inDegree := len(g.InAdj[nodeID])

	if !g.Directed {
		// For undirected graphs, in_degree == out_degree == degree
		return map[string]interface{}{
			"degree":     outDegree,
			"in_degree":  outDegree,
			"out_degree": outDegree,
		}
	}

	return map[string]interface{}{
		"degree":     inDegree + outDegree,
		"in_degree":  inDegree,
		"out_degree": outDegree,
	}
}

// GetGraphInfo returns information about a graph
func GetGraphInfo(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"error": "graph_not_found"}
	}

	edgeCount := 0
	for node := range g.Adj {
		edgeCount += len(g.Adj[node])
	}
	if !g.Directed {
		edgeCount /= 2
	}

	isConnectedResult := IsConnected(graphID)
	hasCycleResult := HasCycle(graphID)

	return map[string]interface{}{
		"id":           g.ID,
		"directed":     g.Directed,
		"weighted":     g.Weighted,
		"node_count":   len(g.Nodes),
		"edge_count":   edgeCount,
		"is_connected": isConnectedResult["is_connected"],
		"has_cycle":    hasCycleResult["has_cycle"],
	}
}

// ClearGraph removes all nodes and edges
func ClearGraph(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}

	g.Nodes = make(map[string]bool)
	g.Adj = make(map[string]map[string]float64)
	g.InAdj = make(map[string]map[string]float64)

	Store.Save()
	return map[string]interface{}{"success": true}
}

// CloneGraph creates a copy of a graph
func CloneGraph(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"error": "graph_not_found"}
	}

	newID := Store.GenerateID()
	newGraph := &Graph{
		ID:       newID,
		Directed: g.Directed,
		Weighted: g.Weighted,
		Nodes:    make(map[string]bool),
		Adj:      make(map[string]map[string]float64),
		InAdj:    make(map[string]map[string]float64),
	}

	// Copy nodes
	for node := range g.Nodes {
		newGraph.Nodes[node] = true
		newGraph.Adj[node] = make(map[string]float64)
		newGraph.InAdj[node] = make(map[string]float64)
	}

	// Copy edges
	for from, neighbors := range g.Adj {
		for to, weight := range neighbors {
			newGraph.Adj[from][to] = weight
		}
	}
	for to, neighbors := range g.InAdj {
		for from, weight := range neighbors {
			newGraph.InAdj[to][from] = weight
		}
	}

	Store.AddGraph(newGraph)

	edgeCount := 0
	for node := range newGraph.Adj {
		edgeCount += len(newGraph.Adj[node])
	}
	if !newGraph.Directed {
		edgeCount /= 2
	}

	return map[string]interface{}{
		"id":         newID,
		"directed":   newGraph.Directed,
		"weighted":   newGraph.Weighted,
		"node_count": len(newGraph.Nodes),
		"edge_count": edgeCount,
	}
}

// Subgraph creates a subgraph containing only specified nodes
func Subgraph(graphID string, nodes []string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"error": "graph_not_found"}
	}

	newID := Store.GenerateID()
	newGraph := &Graph{
		ID:       newID,
		Directed: g.Directed,
		Weighted: g.Weighted,
		Nodes:    make(map[string]bool),
		Adj:      make(map[string]map[string]float64),
		InAdj:    make(map[string]map[string]float64),
	}

	// Create node set for quick lookup
	nodeSet := make(map[string]bool)
	for _, node := range nodes {
		if g.Nodes[node] {
			nodeSet[node] = true
			newGraph.Nodes[node] = true
			newGraph.Adj[node] = make(map[string]float64)
			newGraph.InAdj[node] = make(map[string]float64)
		}
	}

	// Copy edges between nodes in the subgraph
	for from := range nodeSet {
		for to, weight := range g.Adj[from] {
			if nodeSet[to] {
				newGraph.Adj[from][to] = weight
				newGraph.InAdj[to][from] = weight
			}
		}
	}

	Store.AddGraph(newGraph)

	edgeCount := 0
	for node := range newGraph.Adj {
		edgeCount += len(newGraph.Adj[node])
	}
	if !newGraph.Directed {
		edgeCount /= 2
	}

	return map[string]interface{}{
		"id":         newID,
		"directed":   newGraph.Directed,
		"weighted":   newGraph.Weighted,
		"node_count": len(newGraph.Nodes),
		"edge_count": edgeCount,
	}
}
