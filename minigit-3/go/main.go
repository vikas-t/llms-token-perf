package main

import (
	"fmt"
	"minigit/cmd"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: minigit <command> [<args>]")
		os.Exit(1)
	}

	command := os.Args[1]
	args := os.Args[2:]

	var err error

	switch command {
	case "init":
		err = cmd.Init(args)
	case "add":
		err = cmd.Add(args)
	case "commit":
		err = cmd.Commit(args)
	case "status":
		err = cmd.Status(args)
	case "log":
		err = cmd.Log(args)
	case "diff":
		err = cmd.Diff(args)
	case "branch":
		err = cmd.Branch(args)
	case "checkout":
		err = cmd.Checkout(args)
	case "merge":
		err = cmd.Merge(args)
	case "tag":
		err = cmd.Tag(args)
	case "show":
		err = cmd.Show(args)
	case "cat-file":
		err = cmd.CatFile(args)
	case "ls-tree":
		err = cmd.LsTree(args)
	case "ls-files":
		err = cmd.LsFiles(args)
	case "rev-parse":
		err = cmd.RevParse(args)
	case "hash-object":
		err = cmd.HashObject(args)
	case "update-ref":
		err = cmd.UpdateRef(args)
	case "symbolic-ref":
		err = cmd.SymbolicRef(args)
	default:
		fmt.Fprintf(os.Stderr, "minigit: '%s' is not a minigit command\n", command)
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
