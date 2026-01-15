package main

import ("encoding/json"; "fmt"; g "graphlib/lib"; "io"; "os")

func main() {
	if len(os.Args) < 2 { os.Exit(1) }
	cmd := os.Args[1]
	in, _ := io.ReadAll(os.Stdin)
	var a []interface{}
	json.Unmarshal(in, &a)
	var r interface{}
	switch cmd {
	case "create_graph":
		o := opts(a, 0); r = g.CreateGraph(b(o, "directed"), b(o, "weighted"))
	case "add_node": r = g.AddNode(s(a, 0), s(a, 1))
	case "add_edge": r = g.AddEdge(s(a, 0), s(a, 1), s(a, 2), w(a, 3))
	case "remove_node": r = g.RemoveNode(s(a, 0), s(a, 1))
	case "remove_edge": r = g.RemoveEdge(s(a, 0), s(a, 1), s(a, 2))
	case "get_nodes": r = g.GetNodes(s(a, 0))
	case "get_edges": r = g.GetEdges(s(a, 0))
	case "get_neighbors": r = g.GetNeighbors(s(a, 0), s(a, 1))
	case "has_node": r = g.HasNode(s(a, 0), s(a, 1))
	case "has_edge": r = g.HasEdge(s(a, 0), s(a, 1), s(a, 2))
	case "get_degree": r = g.GetDegree(s(a, 0), s(a, 1))
	case "bfs": r = g.BFS(s(a, 0), s(a, 1))
	case "dfs": r = g.DFS(s(a, 0), s(a, 1))
	case "shortest_path": r = g.ShortestPath(s(a, 0), s(a, 1), s(a, 2))
	case "all_shortest_paths": r = g.AllShortestPaths(s(a, 0), s(a, 1))
	case "has_path": r = g.HasPath(s(a, 0), s(a, 1), s(a, 2))
	case "has_cycle": r = g.HasCycle(s(a, 0))
	case "is_dag": r = g.IsDAG(s(a, 0))
	case "topological_sort": r = g.TopologicalSort(s(a, 0))
	case "connected_components": r = g.ConnectedComponents(s(a, 0))
	case "strongly_connected_components": r = g.StronglyConnectedComponents(s(a, 0))
	case "is_connected": r = g.IsConnected(s(a, 0))
	case "get_graph_info": r = g.GetGraphInfo(s(a, 0))
	case "clear_graph": r = g.ClearGraph(s(a, 0))
	case "clone_graph": r = g.CloneGraph(s(a, 0))
	case "subgraph": r = g.Subgraph(s(a, 0), sl(a, 1))
	default: fmt.Fprintf(os.Stderr, "Unknown: %s\n", cmd); os.Exit(1)
	}
	out, _ := json.Marshal(r); fmt.Println(string(out))
}

func s(a []interface{}, i int) string {
	if i < len(a) { if v, ok := a[i].(string); ok { return v } }; return ""
}
func opts(a []interface{}, i int) map[string]interface{} {
	if i < len(a) { if m, ok := a[i].(map[string]interface{}); ok { return m } }; return nil
}
func b(o map[string]interface{}, k string) bool {
	if o != nil { if v, ok := o[k].(bool); ok { return v } }; return false
}
func w(a []interface{}, i int) *float64 {
	if i < len(a) && a[i] != nil { if f, ok := a[i].(float64); ok { return &f } }; return nil
}
func sl(a []interface{}, i int) []string {
	if i < len(a) {
		if arr, ok := a[i].([]interface{}); ok {
			r := make([]string, len(arr))
			for j, v := range arr { if str, ok := v.(string); ok { r[j] = str } }
			return r
		}
	}; return []string{}
}
