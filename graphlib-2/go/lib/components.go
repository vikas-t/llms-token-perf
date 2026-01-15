package lib

import (
	"sort"
)

// HasCycle checks if the graph contains any cycle
func (g *Graph) HasCycle() (bool, []string) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if len(g.Nodes) == 0 {
		return false, []string{}
	}

	if g.Directed {
		return g.hasCycleDirected()
	}
	return g.hasCycleUndirected()
}

func (g *Graph) hasCycleDirected() (bool, []string) {
	// Colors: 0 = white (unvisited), 1 = gray (in progress), 2 = black (done)
	color := make(map[string]int)
	parent := make(map[string]string)
	var cycleStart, cycleEnd string

	var dfs func(node string) bool
	dfs = func(node string) bool {
		color[node] = 1 // gray

		neighbors := make([]string, 0)
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if color[neighbor] == 1 {
				// Back edge found - cycle detected
				cycleStart = neighbor
				cycleEnd = node
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

	// Get nodes in sorted order for deterministic behavior
	nodes := make([]string, 0, len(g.Nodes))
	for n := range g.Nodes {
		nodes = append(nodes, n)
	}
	sort.Strings(nodes)

	for _, node := range nodes {
		if color[node] == 0 {
			if dfs(node) {
				// Reconstruct cycle
				cycle := []string{}
				current := cycleEnd
				for current != cycleStart {
					cycle = append([]string{current}, cycle...)
					current = parent[current]
				}
				cycle = append([]string{cycleStart}, cycle...)
				cycle = append(cycle, cycleStart)
				return true, cycle
			}
		}
	}

	return false, []string{}
}

func (g *Graph) hasCycleUndirected() (bool, []string) {
	visited := make(map[string]bool)
	parent := make(map[string]string)
	var cycleStart, cycleEnd string

	var dfs func(node, par string) bool
	dfs = func(node, par string) bool {
		visited[node] = true

		neighbors := make([]string, 0)
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
				// Cycle found
				cycleStart = neighbor
				cycleEnd = node
				return true
			}
		}
		return false
	}

	// Check for self-loops first
	for node := range g.Nodes {
		if _, exists := g.Adj[node][node]; exists {
			return true, []string{node, node}
		}
	}

	nodes := make([]string, 0, len(g.Nodes))
	for n := range g.Nodes {
		nodes = append(nodes, n)
	}
	sort.Strings(nodes)

	for _, node := range nodes {
		if !visited[node] {
			if dfs(node, "") {
				// Reconstruct cycle
				cycle := []string{}
				current := cycleEnd
				for current != cycleStart {
					cycle = append([]string{current}, cycle...)
					current = parent[current]
				}
				cycle = append([]string{cycleStart}, cycle...)
				cycle = append(cycle, cycleStart)
				return true, cycle
			}
		}
	}

	return false, []string{}
}

// IsDAG checks if the graph is a Directed Acyclic Graph
func (g *Graph) IsDAG() bool {
	g.mu.RLock()
	directed := g.Directed
	g.mu.RUnlock()

	if !directed {
		return false
	}

	hasCycle, _ := g.HasCycle()
	return !hasCycle
}

// TopologicalSort returns a topological ordering of the graph
func (g *Graph) TopologicalSort() (bool, []string, string) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if !g.Directed {
		return false, nil, "not_a_dag"
	}

	// Check for cycles
	hasCycle, _ := g.hasCycleDirected()
	if hasCycle {
		return false, nil, "not_a_dag"
	}

	// Kahn's algorithm
	inDegree := make(map[string]int)
	for node := range g.Nodes {
		inDegree[node] = 0
	}

	for _, edges := range g.Adj {
		for to := range edges {
			inDegree[to]++
		}
	}

	// Queue of nodes with no incoming edges
	queue := make([]string, 0)
	for node, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, node)
		}
	}
	sort.Strings(queue)

	result := make([]string, 0, len(g.Nodes))

	for len(queue) > 0 {
		// Sort queue to ensure deterministic order
		sort.Strings(queue)
		node := queue[0]
		queue = queue[1:]
		result = append(result, node)

		neighbors := make([]string, 0)
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

	if len(result) != len(g.Nodes) {
		return false, nil, "not_a_dag"
	}

	return true, result, ""
}

// ConnectedComponents finds all connected components
func (g *Graph) ConnectedComponents() [][]string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if len(g.Nodes) == 0 {
		return [][]string{}
	}

	visited := make(map[string]bool)
	components := make([][]string, 0)

	// For directed graphs, we compute weakly connected components
	// by treating the graph as undirected
	adjUndirected := make(map[string]map[string]bool)
	for node := range g.Nodes {
		adjUndirected[node] = make(map[string]bool)
	}

	for from, edges := range g.Adj {
		for to := range edges {
			adjUndirected[from][to] = true
			adjUndirected[to][from] = true
		}
	}

	var bfs func(start string) []string
	bfs = func(start string) []string {
		component := make([]string, 0)
		queue := []string{start}
		visited[start] = true

		for len(queue) > 0 {
			node := queue[0]
			queue = queue[1:]
			component = append(component, node)

			neighbors := make([]string, 0)
			for neighbor := range adjUndirected[node] {
				neighbors = append(neighbors, neighbor)
			}
			sort.Strings(neighbors)

			for _, neighbor := range neighbors {
				if !visited[neighbor] {
					visited[neighbor] = true
					queue = append(queue, neighbor)
				}
			}
		}

		sort.Strings(component)
		return component
	}

	nodes := make([]string, 0, len(g.Nodes))
	for n := range g.Nodes {
		nodes = append(nodes, n)
	}
	sort.Strings(nodes)

	for _, node := range nodes {
		if !visited[node] {
			component := bfs(node)
			components = append(components, component)
		}
	}

	// Sort components by first element
	sort.Slice(components, func(i, j int) bool {
		if len(components[i]) == 0 {
			return true
		}
		if len(components[j]) == 0 {
			return false
		}
		return components[i][0] < components[j][0]
	})

	return components
}

// StronglyConnectedComponents finds SCCs using Kosaraju's algorithm
func (g *Graph) StronglyConnectedComponents() [][]string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if len(g.Nodes) == 0 {
		return [][]string{}
	}

	// For undirected graphs, return same as connected components
	if !g.Directed {
		g.mu.RUnlock()
		components := g.ConnectedComponents()
		g.mu.RLock()
		return components
	}

	// Kosaraju's algorithm
	// Step 1: DFS to get finish order
	visited := make(map[string]bool)
	finishOrder := make([]string, 0, len(g.Nodes))

	var dfs1 func(node string)
	dfs1 = func(node string) {
		visited[node] = true

		neighbors := make([]string, 0)
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				dfs1(neighbor)
			}
		}
		finishOrder = append(finishOrder, node)
	}

	nodes := make([]string, 0, len(g.Nodes))
	for n := range g.Nodes {
		nodes = append(nodes, n)
	}
	sort.Strings(nodes)

	for _, node := range nodes {
		if !visited[node] {
			dfs1(node)
		}
	}

	// Step 2: Build transpose graph
	transpose := make(map[string]map[string]bool)
	for node := range g.Nodes {
		transpose[node] = make(map[string]bool)
	}
	for from, edges := range g.Adj {
		for to := range edges {
			transpose[to][from] = true
		}
	}

	// Step 3: DFS on transpose in reverse finish order
	visited = make(map[string]bool)
	components := make([][]string, 0)

	var dfs2 func(node string, component *[]string)
	dfs2 = func(node string, component *[]string) {
		visited[node] = true
		*component = append(*component, node)

		neighbors := make([]string, 0)
		for neighbor := range transpose[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				dfs2(neighbor, component)
			}
		}
	}

	// Process in reverse finish order
	for i := len(finishOrder) - 1; i >= 0; i-- {
		node := finishOrder[i]
		if !visited[node] {
			component := make([]string, 0)
			dfs2(node, &component)
			sort.Strings(component)
			components = append(components, component)
		}
	}

	// Sort components by first element
	sort.Slice(components, func(i, j int) bool {
		if len(components[i]) == 0 {
			return true
		}
		if len(components[j]) == 0 {
			return false
		}
		return components[i][0] < components[j][0]
	})

	return components
}

// IsConnected checks if the graph is connected
func (g *Graph) IsConnected() bool {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if len(g.Nodes) == 0 {
		return true
	}

	// Get any starting node
	var start string
	for n := range g.Nodes {
		start = n
		break
	}

	// BFS treating graph as undirected (for weak connectivity in directed graphs)
	visited := make(map[string]bool)
	queue := []string{start}
	visited[start] = true

	// Build undirected adjacency for directed graphs
	adjUndirected := make(map[string]map[string]bool)
	for node := range g.Nodes {
		adjUndirected[node] = make(map[string]bool)
	}
	for from, edges := range g.Adj {
		for to := range edges {
			adjUndirected[from][to] = true
			adjUndirected[to][from] = true
		}
	}

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		for neighbor := range adjUndirected[node] {
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
			}
		}
	}

	return len(visited) == len(g.Nodes)
}
