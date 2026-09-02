import * as path from 'path';
import { Model } from 'mongoose';

/**
 * Escapes regex special characters in a string.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes a folder string: trims whitespace, strips leading/trailing slashes, and defaults to ''.
 */
export function normalizeFolder(folder?: string | null): string {
  if (!folder) return '';
  return folder.trim().replace(/^[\\\/]+|[\\\/]+$/g, '');
}

/**
 * Decomposes a filename into its base name, root stem, optional existing numeric suffix, and extension.
 *
 * Examples:
 * - "report.pdf" -> { base: "report", stem: "report", initialSuffix: null, ext: ".pdf" }
 * - "report (2).pdf" -> { base: "report (2)", stem: "report", initialSuffix: 2, ext: ".pdf" }
 * - "report (final).pdf" -> { base: "report (final)", stem: "report (final)", initialSuffix: null, ext: ".pdf" }
 * - "financial.report.2026.xlsx" -> { base: "financial.report.2026", stem: "financial.report.2026", initialSuffix: null, ext: ".xlsx" }
 * - "README" -> { base: "README", stem: "README", initialSuffix: null, ext: "" }
 * - "README (1)" -> { base: "README (1)", stem: "README", initialSuffix: 1, ext: "" }
 */
export function parseFilenameParts(filename: string): {
  base: string;
  stem: string;
  initialSuffix: number | null;
  ext: string;
} {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  // Check if base ends with " (N)" where N is a positive integer
  const match = base.match(/^(.*?)\s*\((\d+)\)$/);
  if (match) {
    const rawNum = parseInt(match[2], 10);
    if (!isNaN(rawNum) && rawNum > 0) {
      return {
        base,
        stem: match[1].trim(),
        initialSuffix: rawNum,
        ext,
      };
    }
  }

  return {
    base,
    stem: base,
    initialSuffix: null,
    ext,
  };
}

/**
 * Pure function to compute the lowest available unique filename given the target filename
 * and an array of existing filenames in the same folder.
 * Case-insensitive comparison is used.
 */
export function computeUniqueFilename(
  targetFilename: string,
  existingFilenames: string[],
): string {
  const cleanTarget = (targetFilename || '').trim();
  if (!cleanTarget) return targetFilename;

  const lowerExisting = (existingFilenames || []).map((f) => (f || '').trim().toLowerCase());

  // If exact target filename does NOT exist in the folder (case-insensitive), keep original name unchanged!
  if (!lowerExisting.includes(cleanTarget.toLowerCase())) {
    return cleanTarget;
  }

  // Exact collision exists. Parse the stem and extension.
  const { stem, ext } = parseFilenameParts(cleanTarget);

  // Find all used numeric suffixes for this stem and extension
  // Matches: "^<stem>(?: \((\d+)\))?<ext>$"
  const pattern = new RegExp(
    `^${escapeRegExp(stem)}(?:\\s*\\((\\d+)\\))?${escapeRegExp(ext)}$`,
    'i',
  );

  const usedSuffixes = new Set<number>();

  for (const existing of existingFilenames) {
    const match = (existing || '').trim().match(pattern);
    if (match) {
      if (match[1] === undefined) {
        // Base name without suffix (equivalent to index 0)
        usedSuffixes.add(0);
      } else {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0) {
          usedSuffixes.add(num);
        }
      }
    }
  }

  // Find the lowest available positive integer k >= 1
  let k = 1;
  while (usedSuffixes.has(k)) {
    k++;
  }

  return `${stem} (${k})${ext}`;
}

/**
 * Queries a MongoDB model to find existing files in the given folder and resolves a unique filename.
 */
export async function resolveUniqueFilenameForModel(
  model: Model<any>,
  originalFilename: string,
  folder?: string | null,
  excludeId?: string | any,
): Promise<string> {
  const cleanTarget = (originalFilename || '').trim();
  if (!cleanTarget) return originalFilename;

  const normalizedFolder = normalizeFolder(folder);
  const { stem, ext } = parseFilenameParts(cleanTarget);

  const queryRegex = new RegExp(
    `^${escapeRegExp(stem)}(?:\\s*\\(\\d+\\))?${escapeRegExp(ext)}$`,
    'i',
  );

  const filter: any = {
    folder: normalizedFolder,
    originalName: { $regex: queryRegex },
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const existingDocs = await model
    .find(filter)
    .select('originalName')
    .lean()
    .exec();

  const existingNames = existingDocs
    .map((d: any) => d.originalName)
    .filter(Boolean);

  return computeUniqueFilename(cleanTarget, existingNames);
}
