import { Injectable } from '@nestjs/common';
import type { Assignment } from '@prisma/client';
import { DbService, Tx } from '../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/env';
import { conflict } from '../common/errors';
import { currentTenantId, currentUser } from '../common/context';

export interface Gate { code: 'G0' | 'G1' | 'G2' | 'G3' | 'G5'; label: string; open: boolean; reason?: string }

/**
 * The five activation gates (BR-40, ai-grading-design §2). All must be open for any data to leave the system.
 * Per decision D11 the provider is "disabled" in every running environment, so G0 stays closed until official approval.
 */
@Injectable()
export class AiGateService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  async killSwitchOn(): Promise<boolean> {
    const s = await this.db.appClient.platformSetting.findUnique({ where: { key: 'ai.kill_switch' } });
    return (s?.value as any)?.enabled === true;
  }

  async statusIn(tx: Tx, assignment?: Pick<Assignment, 'aiGradingAllowed'> | null) {
    const cfg = loadConfig();
    const settings = await tx.tenantSettings.findUnique({ where: { tenantId: currentTenantId() } });
    const gates: Gate[] = [
      {
        code: 'G0', label: 'Nhà cung cấp AI được cấu hình',
        open: false,
        reason: cfg.aiProvider === 'disabled'
          ? 'AI đang TẮT theo quyết định D11 (chưa có phê duyệt gửi dữ liệu học sinh tới Anthropic).'
          : 'Tích hợp nhà cung cấp AI chỉ được bật sau khi có phê duyệt chính thức (D11.7).',
      },
      { code: 'G1', label: 'Công tắc AI của nền tảng', open: await this.killSwitchOn(), reason: 'Platform Admin chưa bật AI.' },
      {
        code: 'G2', label: 'Trường đã bật AI và ghi nhận phê duyệt xử lý dữ liệu',
        open: !!settings?.aiEnabled && !!settings.aiApprovalRef, reason: 'Trường chưa bật AI hoặc chưa ghi nhận phê duyệt.',
      },
      ...(assignment ? [{ code: 'G3' as const, label: 'Bài tập cho phép dùng AI', open: assignment.aiGradingAllowed, reason: 'Bài tập chưa bật tùy chọn "Cho phép AI hỗ trợ chấm".' }] : []),
      { code: 'G5', label: 'Đã cấu hình ngân sách AI', open: settings?.aiMonthlyLimitMicros != null && settings.aiMonthlyLimitMicros > 0n, reason: 'Chưa cấu hình hạn mức chi phí AI.' },
    ];
    for (const g of gates) if (g.open) delete g.reason;
    return { enabled: gates.every((g) => g.open), provider: cfg.aiProvider, gates };
  }

  status(assignmentId?: string) {
    return this.db.tenant(async (tx) => {
      const a = assignmentId ? await tx.assignment.findFirst({ where: { id: assignmentId, ownerTeacherId: currentUser().id } }) : null;
      return this.statusIn(tx, a);
    });
  }

  /** GV kích hoạt chấm AI (UC-40). Refuses – without sending anything – while any gate is closed. */
  request(assignmentId: string) {
    return this.db.tenant(async (tx) => {
      const a = await tx.assignment.findFirst({ where: { id: assignmentId, ownerTeacherId: currentUser().id, deletedAt: null } });
      const st = await this.statusIn(tx, a);
      await this.audit.log(tx, { action: 'ai_grading.request_denied', resourceType: 'assignment', resourceId: assignmentId, metadata: { closed: st.gates.filter((g) => !g.open).map((g) => g.code) } });
      // Even if every gate were open, the provider pipeline is intentionally not wired until approval (D11.7).
      throw conflict('AI_GATE_CLOSED', st.gates.find((g) => !g.open)?.reason ?? 'AI chưa được kích hoạt.', { gates: st.gates });
    });
  }
}
