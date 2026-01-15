package lib

import "sort"

func (s *GraphStore) HasCycle(graphID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok || len(g.Nodes) == 0 {
		return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
	}
	if g.Directed {
		return s.detectCycleDirected(g)
	}
	return s.detectCycleUndirected(g)
}

func (s *GraphStore) detectCycleDirected(g *Graph) map[string]interface{} {
	white := make(map[string]bool)
	gray := make(map[string]bool)
	black := make(map[string]bool)
	parent := make(map[string]string)
	for node := range g.Nodes {
		white[node] = true
	}
	var cycle []string
	var cycleFound bool
	var dfs func(node string) bool
	dfs = func(node string) bool {
		delete(white, node)
		gray[node] = true
		neighbors := []string{}
		for neighbor := range g.AdjList[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)
		for _, neighbor := range neighbors {
			if gray[neighbor] {
				cycle = []string{neighbor}
				for n := node; n != neighbor; n = parent[n] {
					cycle = append([]string{n}, cycle...)
				}
				cycle = append(cycle, neighbor)
				cycleFound = true
				return true
			}
			if white[neighbor] {
				parent[neighbor] = node
				if dfs(neighbor) {
					return true
				}
			}
		}
		delete(gray, node)
		black[node] = true
		return false
	}
	nodes := []string{}
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)
	for _, node := range nodes {
		if white[node] {
			if dfs(node) {
				break
			}
		}
	}
	if cycleFound {
		return map[string]interface{}{"has_cycle": true, "cycle": cycle}
	}
	return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
}

func (s *GraphStore) detectCycleUndirected(g *Graph) map[string]interface{} {
	visited := make(map[string]bool)
	parent := make(map[string]string)
	var cycle []string
	var cycleFound bool
	var dfs func(node, par string) bool
	dfs = func(node, par string) bool {
		visited[node] = true
		neighbors := []string{}
		for neighbor := range g.AdjList[node] {
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
				cycle = []string{neighbor}
				for n := node; n != neighbor; n = parent[n] {
					cycle = append([]string{n}, cycle...)
					if n == "" {
						break
					}
				}
				cycle = append(cycle, neighbor)
				cycleFound = true
				return true
			}
		}
		return false
	}
	nodes := []string{}
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
	if cycleFound {
		return map[string]interface{}{"has_cycle": true, "cycle": cycle}
	}
	return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
}

func (s *GraphStore) IsDAG(graphID string) map[string]interface{} {
	s.mu.RLock()
	g, ok := s.graphs[graphID]
	if !ok {
		s.mu.RUnlock()
		return map[string]interface{}{"is_dag": false}
	}
	if !g.Directed {
		s.mu.RUnlock()
		return map[string]interface{}{"is_dag": false}
	}
	s.mu.RUnlock()
	hasCycle := s.HasCycle(graphID)["has_cycle"].(bool)
	return map[string]interface{}{"is_dag": !hasCycle}
}

func (s *GraphStore) TopologicalSort(graphID string) map[string]interface{} {
	s.mu.RLock()
	g, ok := s.graphs[graphID]
	if !ok {
		s.mu.RUnlock()
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	if !g.Directed {
		s.mu.RUnlock()
		return map[string]interface{}{"success": false, "error": "not_a_dag"}
	}
	s.mu.RUnlock()
	hasCycle := s.HasCycle(graphID)["has_cycle"].(bool)
	if hasCycle {
		return map[string]interface{}{"success": false, "error": "not_a_dag"}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	inDegree := make(map[string]int)
	for node := range g.Nodes {
		inDegree[node] = 0
	}
	for _, adj := range g.AdjList {
		for to := range adj {
			inDegree[to]++
		}
	}
	queue := []string{}
	for node := range g.Nodes {
		if inDegree[node] == 0 {
			queue = append(queue, node)
		}
	}
	sort.Strings(queue)
	order := []string{}
	for len(queue) > 0 {
		sort.Strings(queue)
		node := queue[0]
		queue = queue[1:]
		order = append(order, node)
		neighbors := []string{}
		for neighbor := range g.AdjList[node] {
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

func (s *GraphStore) ConnectedComponents(graphID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok || len(g.Nodes) == 0 {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}
	visited := make(map[string]bool)
	components := [][]string{}
	undirAdj := make(map[string]map[string]bool)
	for node := range g.Nodes {
		undirAdj[node] = make(map[string]bool)
	}
	for from, adj := range g.AdjList {
		for to := range adj {
			undirAdj[from][to] = true
			undirAdj[to][from] = true
		}
	}
	var bfs func(start string) []string
	bfs = func(start string) []string {
		component := []string{}
		queue := []string{start}
		visited[start] = true
		for len(queue) > 0 {
			node := queue[0]
			queue = queue[1:]
			component = append(component, node)
			neighbors := []string{}
			for neighbor := range undirAdj[node] {
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
	nodes := []string{}
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)
	for _, node := range nodes {
		if !visited[node] {
			component := bfs(node)
			components = append(components, component)
		}
	}
	return map[string]interface{}{"count": len(components), "components": components}
}

func (s *GraphStore) StronglyConnectedComponents(graphID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok || len(g.Nodes) == 0 {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}
	if !g.Directed {
		s.mu.RUnlock()
		result := s.ConnectedComponents(graphID)
		s.mu.RLock()
		return result
	}
	visited := make(map[string]bool)
	stack := []string{}
	var dfs1 func(node string)
	dfs1 = func(node string) {
		visited[node] = true
		neighbors := []string{}
		for neighbor := range g.AdjList[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)
		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				dfs1(neighbor)
			}
		}
		stack = append(stack, node)
	}
	nodes := []string{}
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)
	for _, node := range nodes {
		if !visited[node] {
			dfs1(node)
		}
	}
	transpose := make(map[string][]string)
	for node := range g.Nodes {
		transpose[node] = []string{}
	}
	for from, adj := range g.AdjList {
		for to := range adj {
			transpose[to] = append(transpose[to], from)
		}
	}
	for node := range transpose {
		sort.Strings(transpose[node])
	}
	visited = make(map[string]bool)
	components := [][]string{}
	var dfs2 func(node string, component *[]string)
	dfs2 = func(node string, component *[]string) {
		visited[node] = true
		*component = append(*component, node)
		for _, neighbor := range transpose[node] {
			if !visited[neighbor] {
				dfs2(neighbor, component)
			}
		}
	}
	for i := len(stack) - 1; i >= 0; i-- {
		node := stack[i]
		if !visited[node] {
			component := []string{}
			dfs2(node, &component)
			sort.Strings(component)
			components = append(components, component)
		}
	}
	return map[string]interface{}{"count": len(components), "components": components}
}

func (s *GraphStore) IsConnected(graphID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok || len(g.Nodes) <= 1 {
		return map[string]interface{}{"is_connected": true}
	}
	undirAdj := make(map[string]map[string]bool)
	for node := range g.Nodes {
		undirAdj[node] = make(map[string]bool)
	}
	for from, adj := range g.AdjList {
		for to := range adj {
			undirAdj[from][to] = true
			undirAdj[to][from] = true
		}
	}
	var start string
	for node := range g.Nodes {
		start = node
		break
	}
	visited := make(map[string]bool)
	queue := []string{start}
	visited[start] = true
	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		for neighbor := range undirAdj[node] {
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
			}
		}
	}
	return map[string]interface{}{"is_connected": len(visited) == len(g.Nodes)}
}
