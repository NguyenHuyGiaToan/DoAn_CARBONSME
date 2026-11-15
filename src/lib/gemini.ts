import type {
  ActionPriority,
  GroundedSummary,
  SuggestedAction,
} from '../types/database';

export interface DssAnalysisResponse {
  executive_summary: string;
  suggested_actions: SuggestedAction[];
  modelUsed: string;
}

const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
  'Gemini 3.8 Flash',
] as const;

const RETRYABLE_STATUS_CODES = new Set([503, 429, 404]);

const SYSTEM_PROMPT = `Bạn là chuyên gia tư vấn quản lý năng lượng theo tiêu chuẩn ISO 50001 dành cho doanh nghiệp vừa và nhỏ (SME) tại Việt Nam.
NHIỆM VỤ: Phân tích dữ liệu phát thải khí nhà kính đã được kiểm chứng từ cơ sở dữ liệu CARBONSME trong gói JSON "grounded_summary" và đề xuất các giải pháp giảm phát thải thực tế, chi phí thấp, khả thi cho SME.

QUY TẮC BẮT BUỘC (PROMPT GROUNDING):
1. CẤM TUYỆT ĐỐI tự tính toán lại bất kỳ phép toán số học nào (không cộng, trừ, nhân, chia hay ước lượng lại tổng phát thải, tỷ trọng hoặc % biến động).
2. CHỈ ĐƯỢC PHÉP trích dẫn đúng nguyên văn các con số nằm trong gói JSON "grounded_summary" được cung cấp.
3. Trả về DUY NHẤT một chuỗi JSON thuần hợp lệ (không bọc markdown \`\`\`json) theo đúng cấu trúc:
{
  "executive_summary": "Chuỗi văn bản tiếng Việt phân tích nguyên nhân biến động và điểm nóng phát thải dựa trên số liệu đã neo.",
  "suggested_actions": [
    {
      "code": "ACT-01",
      "title": "Tiêu đề giải pháp ngắn gọn",
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "description": "Mô tả hành động cụ thể, khả thi theo ISO 50001 cho SME."
    }
  ]
}
4. Mảng "suggested_actions" phải có từ 3 đến 5 giải pháp thực tế, mỗi giải pháp có "priority" chỉ nhận đúng một trong ba giá trị: "HIGH", "MEDIUM", hoặc "LOW".`;

const VALID_PRIORITIES: ActionPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

export async function generateDssRecommendation(
  groundedSummary: GroundedSummary
): Promise<DssAnalysisResponse> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error(
      'Thiếu biến môi trường VITE_GEMINI_API_KEY trong tệp cấu hình.'
    );
  }

  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Hãy phân tích gói dữ liệu grounded_summary sau và trả về JSON kết quả:\n${JSON.stringify(
              groundedSummary,
              null,
              2
            )}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  let lastErrorMessage = 'Tất cả model Gemini dự phòng đều không khả dụng.';

  for (const model of FALLBACK_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      const errText = await response.text();
      lastErrorMessage = `Model ${model} trả về HTTP ${response.status}: ${errText.slice(0, 150)}`;
      continue;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini API (${model}) trả về lỗi (${response.status}): ${errText.slice(0, 200)}`
      );
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error(`Gemini API (${model}) không trả về nội dung phân tích.`);
    }

    const cleanedText = rawText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '');

    const parsed = JSON.parse(cleanedText) as Partial<DssAnalysisResponse>;

    if (
      typeof parsed.executive_summary !== 'string' ||
      !parsed.executive_summary.trim() ||
      !Array.isArray(parsed.suggested_actions) ||
      parsed.suggested_actions.length === 0
    ) {
      throw new Error('Định dạng JSON trả về từ Gemini không đúng cấu trúc yêu cầu.');
    }

    const normalizedActions: SuggestedAction[] = parsed.suggested_actions
      .slice(0, 5)
      .map((act, idx) => ({
        code:
          typeof act.code === 'string' && act.code.trim()
            ? act.code.trim()
            : `ACT-0${idx + 1}`,
        title: String(act.title ?? ''),
        priority: VALID_PRIORITIES.includes(act.priority as ActionPriority)
          ? (act.priority as ActionPriority)
          : 'MEDIUM',
        description: String(act.description ?? ''),
      }));

    return {
      executive_summary: parsed.executive_summary.trim(),
      suggested_actions: normalizedActions,
      modelUsed: model,
    };
  }

  throw new Error(lastErrorMessage);
}

