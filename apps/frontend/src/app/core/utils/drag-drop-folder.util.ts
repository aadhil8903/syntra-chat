export interface DroppedFileWithPath {
  file: File;
  relativePath: string; // e.g. "Q1/results.csv" or "results.csv"
}

export async function extractDroppedFilesAndFolders(dataTransfer: DataTransfer): Promise<DroppedFileWithPath[]> {
  const results: DroppedFileWithPath[] = [];
  const items = dataTransfer.items;

  if (items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === 'function') {
    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as any).webkitGetAsEntry();
      if (entry) entries.push(entry);
    }

    for (const entry of entries) {
      await traverseEntry(entry, '', results);
    }
  } else if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      results.push({
        file: dataTransfer.files[i],
        relativePath: dataTransfer.files[i].name,
      });
    }
  }

  return results;
}

async function traverseEntry(entry: any, currentPath: string, results: DroppedFileWithPath[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    results.push({
      file,
      relativePath: currentPath ? `${currentPath}/${file.name}` : file.name,
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    const entries = await readAllDirectoryEntries(dirReader);
    for (const child of entries) {
      await traverseEntry(child, newPath, results);
    }
  }
}

async function readAllDirectoryEntries(dirReader: any): Promise<any[]> {
  const entries: any[] = [];
  const readBatch = async (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });
  };

  let batch: any[] = [];
  do {
    batch = await readBatch();
    entries.push(...batch);
  } while (batch.length > 0);

  return entries;
}
