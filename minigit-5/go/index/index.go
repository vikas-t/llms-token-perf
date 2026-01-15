package index

import (
	"bytes"
	"crypto/sha1"
	"encoding/binary"
	"fmt"
	"minigit/utils"
	"os"
	"path/filepath"
	"sort"
)

// IndexEntry represents a single index entry
type IndexEntry struct {
	Ctime     int64
	CtimeNano int32
	Mtime     int64
	MtimeNano int32
	Dev       uint32
	Ino       uint32
	Mode      uint32
	UID       uint32
	GID       uint32
	Size      uint32
	SHA       string // 40 hex chars
	Flags     uint16
	Name      string
}

// Index represents the staging area
type Index struct {
	Version uint32
	Entries []IndexEntry
}

// ReadIndex reads the index file
func ReadIndex(gitDir string) (*Index, error) {
	indexPath := filepath.Join(gitDir, "index")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &Index{Version: 2}, nil
		}
		return nil, err
	}

	return ParseIndex(data)
}

// ParseIndex parses binary index data
func ParseIndex(data []byte) (*Index, error) {
	if len(data) < 12 {
		return &Index{Version: 2}, nil
	}

	// Check signature
	if string(data[0:4]) != "DIRC" {
		return nil, fmt.Errorf("invalid index signature")
	}

	version := binary.BigEndian.Uint32(data[4:8])
	count := binary.BigEndian.Uint32(data[8:12])

	idx := &Index{Version: version}
	pos := 12

	for i := uint32(0); i < count; i++ {
		if pos+62 > len(data) {
			break
		}

		entry := IndexEntry{}

		// Read fixed-size fields
		entry.Ctime = int64(binary.BigEndian.Uint32(data[pos:]))
		entry.CtimeNano = int32(binary.BigEndian.Uint32(data[pos+4:]))
		entry.Mtime = int64(binary.BigEndian.Uint32(data[pos+8:]))
		entry.MtimeNano = int32(binary.BigEndian.Uint32(data[pos+12:]))
		entry.Dev = binary.BigEndian.Uint32(data[pos+16:])
		entry.Ino = binary.BigEndian.Uint32(data[pos+20:])
		entry.Mode = binary.BigEndian.Uint32(data[pos+24:])
		entry.UID = binary.BigEndian.Uint32(data[pos+28:])
		entry.GID = binary.BigEndian.Uint32(data[pos+32:])
		entry.Size = binary.BigEndian.Uint32(data[pos+36:])

		// SHA (20 bytes)
		entry.SHA = fmt.Sprintf("%x", data[pos+40:pos+60])

		// Flags (2 bytes)
		entry.Flags = binary.BigEndian.Uint16(data[pos+60:])
		nameLen := entry.Flags & 0x0FFF

		pos += 62

		// Name (variable length, null-terminated)
		if int(nameLen) == 0x0FFF {
			// Extended name length
			nullPos := bytes.IndexByte(data[pos:], 0)
			if nullPos == -1 {
				break
			}
			entry.Name = string(data[pos : pos+nullPos])
			pos += nullPos + 1
		} else {
			entry.Name = string(data[pos : pos+int(nameLen)])
			pos += int(nameLen) + 1
		}

		// Padding to 8-byte boundary
		entryLen := 62 + len(entry.Name) + 1
		padding := (8 - (entryLen % 8)) % 8
		pos += padding

		idx.Entries = append(idx.Entries, entry)
	}

	return idx, nil
}

// WriteIndex writes the index to file
func WriteIndex(gitDir string, idx *Index) error {
	data := BuildIndex(idx)
	indexPath := filepath.Join(gitDir, "index")
	return os.WriteFile(indexPath, data, 0644)
}

// BuildIndex builds binary index data
func BuildIndex(idx *Index) []byte {
	// Sort entries by name
	sort.Slice(idx.Entries, func(i, j int) bool {
		return idx.Entries[i].Name < idx.Entries[j].Name
	})

	var buf bytes.Buffer

	// Header
	buf.WriteString("DIRC")
	binary.Write(&buf, binary.BigEndian, idx.Version)
	binary.Write(&buf, binary.BigEndian, uint32(len(idx.Entries)))

	// Entries
	for _, entry := range idx.Entries {
		binary.Write(&buf, binary.BigEndian, uint32(entry.Ctime))
		binary.Write(&buf, binary.BigEndian, uint32(entry.CtimeNano))
		binary.Write(&buf, binary.BigEndian, uint32(entry.Mtime))
		binary.Write(&buf, binary.BigEndian, uint32(entry.MtimeNano))
		binary.Write(&buf, binary.BigEndian, entry.Dev)
		binary.Write(&buf, binary.BigEndian, entry.Ino)
		binary.Write(&buf, binary.BigEndian, entry.Mode)
		binary.Write(&buf, binary.BigEndian, entry.UID)
		binary.Write(&buf, binary.BigEndian, entry.GID)
		binary.Write(&buf, binary.BigEndian, entry.Size)

		// SHA (20 bytes)
		shaBytes := make([]byte, 20)
		fmt.Sscanf(entry.SHA, "%x", &shaBytes)
		buf.Write(shaBytes)

		// Flags
		nameLen := len(entry.Name)
		if nameLen > 0x0FFF {
			nameLen = 0x0FFF
		}
		flags := uint16(nameLen)
		binary.Write(&buf, binary.BigEndian, flags)

		// Name (null-terminated)
		buf.WriteString(entry.Name)
		buf.WriteByte(0)

		// Padding to 8-byte boundary
		entryLen := 62 + len(entry.Name) + 1
		padding := (8 - (entryLen % 8)) % 8
		for i := 0; i < padding; i++ {
			buf.WriteByte(0)
		}
	}

	// Checksum
	checksum := sha1.Sum(buf.Bytes())
	buf.Write(checksum[:])

	return buf.Bytes()
}

// GetEntry finds an entry by name
func (idx *Index) GetEntry(name string) *IndexEntry {
	for i := range idx.Entries {
		if idx.Entries[i].Name == name {
			return &idx.Entries[i]
		}
	}
	return nil
}

// AddEntry adds or updates an entry
func (idx *Index) AddEntry(entry IndexEntry) {
	// Remove existing entry with same name
	idx.RemoveEntry(entry.Name)
	idx.Entries = append(idx.Entries, entry)
}

// RemoveEntry removes an entry by name
func (idx *Index) RemoveEntry(name string) {
	var newEntries []IndexEntry
	for _, e := range idx.Entries {
		if e.Name != name {
			newEntries = append(newEntries, e)
		}
	}
	idx.Entries = newEntries
}

// GetEntryNames returns all entry names sorted
func (idx *Index) GetEntryNames() []string {
	var names []string
	for _, e := range idx.Entries {
		names = append(names, e.Name)
	}
	sort.Strings(names)
	return names
}

// Clear removes all entries
func (idx *Index) Clear() {
	idx.Entries = nil
}

// ModeFromFileMode converts os.FileMode to git mode
func ModeFromFileMode(mode os.FileMode) uint32 {
	if mode&os.ModeSymlink != 0 {
		return 0120000
	}
	if mode&0111 != 0 {
		return 0100755
	}
	return 0100644
}

// CreateEntryFromFile creates an index entry from a file
func CreateEntryFromFile(path, sha string, info os.FileInfo) IndexEntry {
	mode := ModeFromFileMode(info.Mode())

	entry := IndexEntry{
		Mtime: info.ModTime().Unix(),
		Mode:  mode,
		Size:  uint32(info.Size()),
		SHA:   sha,
		Name:  utils.NormalizePath(path),
	}

	return entry
}
