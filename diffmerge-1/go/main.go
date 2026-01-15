package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	dm "diffmerge/pkg"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: diffmerge <command>")
		os.Exit(1)
	}
	input, _ := io.ReadAll(os.Stdin)
	var args []json.RawMessage
	if err := json.Unmarshal(input, &args); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing JSON: %v\nInput: %s\n", err, string(input))
		os.Exit(1)
	}
	result, err := dm.HandleCommand(os.Args[1], args)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	json.NewEncoder(os.Stdout).Encode(result)
}
