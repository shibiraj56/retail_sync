import { db } from '../config/firebase';
import * as admin from 'firebase-admin';
import type { AuditLogDocument, UserRole } from '../shared/types';

interface AuditLogParams {
  organizationId: string;
  action: string;
  actor: {
    userId: string;
    email: string;
    role?: UserRole;
  };
  targetEntity: {
    collection: string;
    id: string;
  };
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    const auditRef = db
      .collection('organizations')
      .doc(params.organizationId)
      .collection('auditLogs')
      .doc();

    const auditEntry: AuditLogDocument = {
      id: auditRef.id,
      organizationId: params.organizationId,
      action: params.action,
      actor: params.actor,
      targetEntity: params.targetEntity,
      details: params.details,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      timestamp: admin.firestore.Timestamp.now(),
    };

    await auditRef.set(auditEntry);
  } catch (error) {
    // Audit logging failure should not crash the main transaction, but must be logged to stderr
    console.error(`Failed to record audit log for org ${params.organizationId}:`, error);
  }
}
