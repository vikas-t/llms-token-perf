package lib

import (
	"sort"
)

// BFSResult contains the results of a BFS traversal
type BFSResult struct {
	Order  []string          `json:"order"`
	Levels map[string]int    `json:"levels"`
	Parent map[string]string `json:"parent"`
}

// BFS performs breadth-first search from the start node
func (g *Graph) BFS(start string) *BFSResult {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if !g.Nodes[start] {
		return &BFSResult{
			Order:  []string{},
			Levels: make(map[string]int),
			Parent: make(map[string]string),
		}
	}

	result := &BFSResult{
		Order:  make([]string, 0),
		Levels: make(map[string]int),
		Parent: make(map[string]string),
	}

	visited := make(map[string]bool)
	queue := []string{start}
	visited[start] = true
	result.Levels[start] = 0

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		result.Order = append(result.Order, node)

		// Get neighbors in sorted order for deterministic traversal
		neighbors := make([]string, 0)
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
				result.Levels[neighbor] = result.Levels[node] + 1
				result.Parent[neighbor] = node
			}
		}
	}

	return result
}

// DFSResult contains the results of a DFS traversal
type DFSResult struct {
	Order     []string          `json:"order"`
	Discovery map[string]int    `json:"discovery"`
	Finish    map[string]int    `json:"finish"`
	Parent    map[string]string `json:"parent"`
}

// DFS performs depth-first search from the start node
func (g *Graph) DFS(start string) *DFSResult {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if !g.Nodes[start] {
		return &DFSResult{
			Order:     []string{},
			Discovery: make(map[string]int),
			Finish:    make(map[string]int),
			Parent:    make(map[string]string),
		}
	}

	result := &DFSResult{
		Order:     make([]string, 0),
		Discovery: make(map[string]int),
		Finish:    make(map[string]int),
		Parent:    make(map[string]string),
	}

	visited := make(map[string]bool)
	time := 0

	var dfsVisit func(node string)
	dfsVisit = func(node string) {
		visited[node] = true
		result.Discovery[node] = time
		time++
		result.Order = append(result.Order, node)

		// Get neighbors in sorted order for deterministic traversal
		neighbors := make([]string, 0)
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				result.Parent[neighbor] = node
				dfsVisit(neighbor)
			}
		}

		result.Finish[node] = time
		time++
	}

	dfsVisit(start)
	return result
}
