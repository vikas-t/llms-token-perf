package graphlib

import (
	"sort"
)

// BFS performs breadth-first search from a start node
func BFS(graphID, startNode string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{
			"order":  []string{},
			"levels": map[string]int{},
			"parent": map[string]string{},
		}
	}

	if !g.Nodes[startNode] {
		return map[string]interface{}{
			"order":  []string{},
			"levels": map[string]int{},
			"parent": map[string]string{},
		}
	}

	order := []string{}
	levels := make(map[string]int)
	parent := make(map[string]string)
	visited := make(map[string]bool)

	queue := []string{startNode}
	visited[startNode] = true
	levels[startNode] = 0

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		order = append(order, node)

		// Get sorted neighbors for deterministic order
		neighbors := make([]string, 0, len(g.Adj[node]))
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				visited[neighbor] = true
				levels[neighbor] = levels[node] + 1
				parent[neighbor] = node
				queue = append(queue, neighbor)
			}
		}
	}

	return map[string]interface{}{
		"order":  order,
		"levels": levels,
		"parent": parent,
	}
}

// DFS performs depth-first search from a start node
func DFS(graphID, startNode string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{
			"order":     []string{},
			"discovery": map[string]int{},
			"finish":    map[string]int{},
			"parent":    map[string]string{},
		}
	}

	if !g.Nodes[startNode] {
		return map[string]interface{}{
			"order":     []string{},
			"discovery": map[string]int{},
			"finish":    map[string]int{},
			"parent":    map[string]string{},
		}
	}

	order := []string{}
	discovery := make(map[string]int)
	finish := make(map[string]int)
	parent := make(map[string]string)
	visited := make(map[string]bool)
	time := 0

	var dfsVisit func(node string)
	dfsVisit = func(node string) {
		visited[node] = true
		discovery[node] = time
		time++
		order = append(order, node)

		// Get sorted neighbors for deterministic order
		neighbors := make([]string, 0, len(g.Adj[node]))
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				parent[neighbor] = node
				dfsVisit(neighbor)
			}
		}

		finish[node] = time
		time++
	}

	dfsVisit(startNode)

	return map[string]interface{}{
		"order":     order,
		"discovery": discovery,
		"finish":    finish,
		"parent":    parent,
	}
}
