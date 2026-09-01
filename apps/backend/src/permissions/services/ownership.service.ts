import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AclResolverService } from './acl-resolver.service';
import { isAdminRole, isUserAdmin } from '@enter-chat/shared-types';

export type ResourceCollection = 'documents' | 'datasets' | 'conversations' | 'messages';

@Injectable()
export class OwnershipService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly aclResolver: AclResolverService,
  ) {}

  /**
   * Verifies that the given resource exists and belongs to the user,
   * or allows unrestricted access if the user is an administrator.
   * Throws NotFoundException if not found, ForbiddenException if owned by another user and not admin.
   */
  async verifyOwnership(
    collectionName: ResourceCollection,
    resourceId: string,
    userId: string,
    userRole?: string,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(resourceId)) {
      throw new NotFoundException(`Invalid ${collectionName.slice(0, -1)} ID format`);
    }

    const collection = this.connection.collection(collectionName);
    const objectId = new Types.ObjectId(resourceId);
    const userObjectId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId;

    const resource = await collection.findOne({ _id: objectId });

    if (!resource) {
      throw new NotFoundException(
        `${collectionName.charAt(0).toUpperCase() + collectionName.slice(1, -1)} not found`,
      );
    }

    // Check if requester is an administrator - admins have unrestricted access
    let isAdmin = isAdminRole(userRole);
    if (!isAdmin) {
      const usersCollection = this.connection.collection('users');
      const user = await usersCollection.findOne({ _id: userObjectId as any });
      isAdmin = isUserAdmin(user);
    }

    if (isAdmin) {
      return true;
    }

    const resourceUserId = resource.userId || resource.user_id || resource.owner_id;
    const isOwner =
      resourceUserId &&
      (resourceUserId.toString() === userId.toString() ||
        resourceUserId.toString() === userObjectId.toString());

    if (!isOwner) {
      throw new ForbiddenException(
        `You do not have permission to access this ${collectionName.slice(0, -1)}`,
      );
    }

    return true;
  }

  /**
   * Validates a batch of resource IDs (e.g. from @mentions or conversation attachments)
   * ensuring all are accessible by the user according to RBAC and folder permissions.
   * Administrators automatically have access to all valid resources.
   */
  async validateUserResources(
    userId: string,
    resourceIds: string[],
  ): Promise<{ validDocumentIds: string[]; validDatasetIds: string[] }> {
    if (!resourceIds || resourceIds.length === 0) {
      return { validDocumentIds: [], validDatasetIds: [] };
    }

    const validDocumentIds: string[] = [];
    const validDatasetIds: string[] = [];

    const usersCollection = this.connection.collection('users');
    const documentsCollection = this.connection.collection('documents');
    const datasetsCollection = this.connection.collection('datasets');
    const foldersCollection = this.connection.collection('folders');
    const rolesCollection = this.connection.collection('roles');

    const user = Types.ObjectId.isValid(userId)
      ? await usersCollection.findOne({ _id: new Types.ObjectId(userId) })
      : await usersCollection.findOne({ _id: userId as any });
    const isAdmin = isUserAdmin(user);
    const userDepartments: string[] = user?.departments || (user?.department ? [user.department] : []);

    let roleFolders: string[] = [];
    if (user?.role) {
      const roleDoc = await rolesCollection.findOne({ key: user.role.toLowerCase().trim() });
      if (roleDoc && roleDoc.allowedFolders) {
        roleFolders = roleDoc.allowedFolders;
      }
    }

    const allFolders = await foldersCollection.find().toArray();
    const foldersMap = new Map<string, string[]>();
    for (const f of allFolders) {
      foldersMap.set(f.name, f.allowedDepartments || []);
    }

    for (const rawId of resourceIds) {
      if (!Types.ObjectId.isValid(rawId)) {
        continue;
      }

      const objId = new Types.ObjectId(rawId);

      // Check document
      const doc = await documentsCollection.findOne({ _id: objId });
      if (doc) {
        if (isAdmin) {
          validDocumentIds.push(rawId);
          continue;
        }

        const isOwner = doc.userId && doc.userId.toString() === userId.toString();
        const hasDeptAccess =
          !doc.allowedDepartments ||
          doc.allowedDepartments.length === 0 ||
          doc.allowedDepartments.some((d: string) => userDepartments.includes(d));

        const hasFolderAccess = await this.aclResolver.canUserAccessFolder(
          userId,
          doc.folder || '',
          user,
          foldersMap,
          roleFolders,
        );

        if (isOwner || (hasDeptAccess && hasFolderAccess)) {
          validDocumentIds.push(rawId);
          continue;
        }
      }

      // Check dataset
      const dataset = await datasetsCollection.findOne({ _id: objId });
      if (dataset) {
        if (isAdmin) {
          validDatasetIds.push(rawId);
          continue;
        }

        const isOwner = dataset.userId && dataset.userId.toString() === userId.toString();
        const hasDeptAccess =
          !dataset.allowedDepartments ||
          dataset.allowedDepartments.length === 0 ||
          dataset.allowedDepartments.some((d: string) => userDepartments.includes(d));

        const hasFolderAccess = await this.aclResolver.canUserAccessFolder(
          userId,
          dataset.folder || '',
          user,
          foldersMap,
          roleFolders,
        );

        if (isOwner || (hasDeptAccess && hasFolderAccess)) {
          validDatasetIds.push(rawId);
          continue;
        }
      }
    }

    return { validDocumentIds, validDatasetIds };
  }
}

