package graphlib

import (
	"sort"
)

// HasCycle detects if the graph contains a cycle
func HasCycle(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
	}

	if len(g.Nodes) == 0 {
		return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
	}

	if g.Directed {
		return hasCycleDirected(g)
	}
	return hasCycleUndirected(g)
}

func hasCycleDirected(g *Graph) map[string]interface{} {
	// Use DFS with coloring: 0 = white (unvisited), 1 = gray (in progress), 2 = black (done)
	color := make(map[string]int)
	parent := make(map[string]string)

	var cycle []string
	hasCycle := false

	var dfs func(node string) bool
	dfs = func(node string) bool {
		color[node] = 1 // gray

		neighbors := make([]string, 0, len(g.Adj[node]))
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if color[neighbor] == 1 {
				// Back edge found - cycle detected
				hasCycle = true
				// Reconstruct cycle
				cycle = []string{neighbor}
				current := node
				for current != neighbor {
					cycle = append([]string{current}, cycle...)
					current = parent[current]
				}
				cycle = append(cycle, neighbor) // Complete the cycle
				return true
			}
			if color[neighbor] == 0 {
				parent[neighbor] = node
				if dfs(neighbor) {
					return true
				}
			}
		}

		color[node] = 2 // black
		return false
	}

	// Get sorted nodes for deterministic order
	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	for _, node := range nodes {
		if color[node] == 0 {
			if dfs(node) {
				break
			}
		}
	}

	if !hasCycle {
		return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
	}
	return map[string]interface{}{"has_cycle": true, "cycle": cycle}
}

func hasCycleUndirected(g *Graph) map[string]interface{} {
	visited := make(map[string]bool)
	parent := make(map[string]string)

	var cycle []string
	hasCycle := false

	var dfs func(node, par string) bool
	dfs = func(node, par string) bool {
		visited[node] = true

		neighbors := make([]string, 0, len(g.Adj[node]))
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				parent[neighbor] = node
				if dfs(neighbor, node) {
					return true
				}
			} else if neighbor != par {
				// Back edge found - cycle detected
				hasCycle = true
				// Reconstruct cycle
				cycle = []string{neighbor}
				current := node
				for current != neighbor {
					cycle = append([]string{current}, cycle...)
					current = parent[current]
				}
				cycle = append(cycle, neighbor) // Complete the cycle
				return true
			}
		}
		return false
	}

	// Get sorted nodes for deterministic order
	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	for _, node := range nodes {
		if !visited[node] {
			if dfs(node, "") {
				break
			}
		}
	}

	if !hasCycle {
		return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
	}
	return map[string]interface{}{"has_cycle": true, "cycle": cycle}
}

// IsDAG checks if the graph is a Directed Acyclic Graph
func IsDAG(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"is_dag": false}
	}

	// Undirected graphs are not DAGs
	if !g.Directed {
		return map[string]interface{}{"is_dag": false}
	}

	// Empty directed graph is a DAG
	if len(g.Nodes) == 0 {
		return map[string]interface{}{"is_dag": true}
	}

	// A directed graph is a DAG if it has no cycles
	cycleResult := hasCycleDirected(g)
	return map[string]interface{}{"is_dag": !cycleResult["has_cycle"].(bool)}
}

// TopologicalSort returns a topological ordering of the graph
func TopologicalSort(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}

	// Check if it's a DAG
	if !g.Directed {
		return map[string]interface{}{"success": false, "error": "not_a_dag"}
	}

	cycleResult := hasCycleDirected(g)
	if cycleResult["has_cycle"].(bool) {
		return map[string]interface{}{"success": false, "error": "not_a_dag"}
	}

	// Kahn's algorithm
	inDegree := make(map[string]int)
	for node := range g.Nodes {
		inDegree[node] = 0
	}
	for node := range g.Nodes {
		for neighbor := range g.Adj[node] {
			inDegree[neighbor]++
		}
	}

	// Queue of nodes with no incoming edges
	queue := []string{}
	for node := range g.Nodes {
		if inDegree[node] == 0 {
			queue = append(queue, node)
		}
	}
	sort.Strings(queue)

	order := []string{}
	for len(queue) > 0 {
		// Sort queue to ensure deterministic order
		sort.Strings(queue)
		node := queue[0]
		queue = queue[1:]
		order = append(order, node)

		neighbors := make([]string, 0, len(g.Adj[node]))
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	return map[string]interface{}{"success": true, "order": order}
}

// ConnectedComponents finds all connected components
func ConnectedComponents(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}

	if len(g.Nodes) == 0 {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}

	visited := make(map[string]bool)
	components := [][]string{}

	// Get sorted nodes for deterministic order
	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	for _, node := range nodes {
		if !visited[node] {
			component := []string{}
			bfsComponent(g, node, visited, &component)
			sort.Strings(component)
			components = append(components, component)
		}
	}

	return map[string]interface{}{"count": len(components), "components": components}
}

func bfsComponent(g *Graph, start string, visited map[string]bool, component *[]string) {
	queue := []string{start}
	visited[start] = true

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		*component = append(*component, node)

		// For connectivity, we need to consider both directions for directed graphs (weak connectivity)
		neighbors := make(map[string]bool)
		for neighbor := range g.Adj[node] {
			neighbors[neighbor] = true
		}
		for neighbor := range g.InAdj[node] {
			neighbors[neighbor] = true
		}

		sortedNeighbors := make([]string, 0, len(neighbors))
		for neighbor := range neighbors {
			sortedNeighbors = append(sortedNeighbors, neighbor)
		}
		sort.Strings(sortedNeighbors)

		for _, neighbor := range sortedNeighbors {
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
			}
		}
	}
}

// StronglyConnectedComponents finds SCCs using Kosaraju's algorithm
func StronglyConnectedComponents(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}

	if len(g.Nodes) == 0 {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}

	// For undirected graphs, SCC is the same as CC
	if !g.Directed {
		return ConnectedComponents(graphID)
	}

	// Kosaraju's algorithm
	// Step 1: Fill nodes in stack according to their finishing times
	visited := make(map[string]bool)
	stack := []string{}

	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)

	var fillOrder func(node string)
	fillOrder = func(node string) {
		visited[node] = true

		neighbors := make([]string, 0, len(g.Adj[node]))
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				fillOrder(neighbor)
			}
		}
		stack = append(stack, node)
	}

	for _, node := range nodes {
		if !visited[node] {
			fillOrder(node)
		}
	}

	// Step 2: Create a reversed graph (use InAdj)
	// Step 3: Do DFS using the reversed graph in order of decreasing finish time
	visited = make(map[string]bool)
	components := [][]string{}

	var dfsReverse func(node string, component *[]string)
	dfsReverse = func(node string, component *[]string) {
		visited[node] = true
		*component = append(*component, node)

		neighbors := make([]string, 0, len(g.InAdj[node]))
		for neighbor := range g.InAdj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				dfsReverse(neighbor, component)
			}
		}
	}

	// Process nodes in reverse order of finishing time (pop from stack)
	for i := len(stack) - 1; i >= 0; i-- {
		node := stack[i]
		if !visited[node] {
			component := []string{}
			dfsReverse(node, &component)
			sort.Strings(component)
			components = append(components, component)
		}
	}

	return map[string]interface{}{"count": len(components), "components": components}
}

// IsConnected checks if the graph is connected
func IsConnected(graphID string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"is_connected": false}
	}

	// Empty graph is connected
	if len(g.Nodes) == 0 {
		return map[string]interface{}{"is_connected": true}
	}

	// Single node is connected
	if len(g.Nodes) == 1 {
		return map[string]interface{}{"is_connected": true}
	}

	// Check weak connectivity (same as number of connected components == 1)
	ccResult := ConnectedComponents(graphID)
	return map[string]interface{}{"is_connected": ccResult["count"].(int) == 1}
}
