import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { UserRole, isUserAdmin } from '@enter-chat/shared-types';

@Injectable()
export class AclResolverService {
  private readonly logger = new Logger(AclResolverService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Generates the ancestor chain from a folder path down to root.
   * e.g. "Finance/Reports/Q3" -> ["Finance/Reports/Q3", "Finance/Reports", "Finance", ""]
   */
  getAncestorChain(folderPath: string): string[] {
    const clean = (folderPath || '').trim();
    if (!clean) return [''];

    const parts = clean.split('/').filter((p) => p.length > 0);
    const chain: string[] = [];

    for (let i = parts.length; i > 0; i--) {
      chain.push(parts.slice(0, i).join('/'));
    }
    chain.push(''); // Root
    return chain;
  }

  /**
   * Evaluates folder access according to Spec Round 13 resolution algorithm:
   * 1. Walk from folder X up to root. If user's explicit rule (allowedFolders / deniedFolders)
   *    is found at nearest ancestor, that entry's effect (allow/deny) is final. Stop here.
   * 2. Otherwise, check if X or any ancestor is covered by either:
   *    - Department grant (folder's allowedDepartments contains user's department)
   *    - Role grant (role's allowedFolders contains X or ancestor)
   * 3. Default deny.
   */
  async canUserAccessFolder(
    userId: string,
    folderPath: string,
    cachedUser?: any,
    cachedFoldersMap?: Map<string, string[]>,
    cachedRoleFolders?: string[],
  ): Promise<boolean> {
    const usersCol = this.connection.collection('users');
    const rolesCol = this.connection.collection('roles');
    const foldersCol = this.connection.collection('folders');

    const user =
      cachedUser ||
      (Types.ObjectId.isValid(userId)
        ? await usersCol.findOne({ _id: new Types.ObjectId(userId) })
        : await usersCol.findOne({ _id: userId as any }));

    if (!user) return false;

    // Admin always has unrestricted access to all folders
    if (isUserAdmin(user)) {
      return true;
    }

    const ancestors = this.getAncestorChain(folderPath);

    const userAllowedFolders: string[] = user.allowedFolders || [];
    const userDeniedFolders: string[] = user.deniedFolders || [];
    const userDepartments: string[] = user.departments || (user.department ? [user.department] : []);

    // Step 1: Walk from folder up to root looking for explicit user rules
    for (const anc of ancestors) {
      if (userDeniedFolders.includes(anc)) {
        return false; // Explicit user DENY overrides everything
      }
      if (userAllowedFolders.includes(anc)) {
        return true; // Explicit user ALLOW overrides everything
      }
    }

    // Step 2: Check Role template & Department grants (additive allow-only)
    let roleFolders: string[] = cachedRoleFolders || [];
    if (!cachedRoleFolders && user.role) {
      const roleDoc = await rolesCol.findOne({ key: user.role.toLowerCase().trim() });
      if (roleDoc && roleDoc.allowedFolders) {
        roleFolders = roleDoc.allowedFolders;
      }
    }

    // Check if any ancestor is in role's allowedFolders
    const roleGrantsAccess = ancestors.some((anc) => roleFolders.includes(anc));
    if (roleGrantsAccess) {
      return true;
    }

    // Check department grants on folder or ancestors
    for (const anc of ancestors) {
      if (!anc) continue; // Skip empty root for department checks

      let folderDeps: string[] = [];
      if (cachedFoldersMap && cachedFoldersMap.has(anc)) {
        folderDeps = cachedFoldersMap.get(anc) || [];
      } else {
        const folderDoc = await foldersCol.findOne({ name: anc });
        if (folderDoc && folderDoc.allowedDepartments) {
          folderDeps = folderDoc.allowedDepartments;
        }
      }

      if (folderDeps.length > 0 && userDepartments.some((d) => folderDeps.includes(d))) {
        return true;
      }
    }

    // If folderPath is empty root and no explicit rule denied it, allow basic access
    if (!folderPath || folderPath.trim() === '') {
      return true;
    }

    // Step 3: Default deny
    return false;
  }
}
