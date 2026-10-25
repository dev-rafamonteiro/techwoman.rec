import { z } from 'zod';
import { defineEndpoint, OkSchema } from './common.js';

/**
 * Evento do webhook do WAHA, validado de forma frouxa: só os campos que E47 lê (RN18); o resto passa sem checagem.
 * Não fica em `E47.body` porque a assinatura é conferida no corpo bruto antes de ler o JSON e porque o WAHA manda
 * campos que não controlamos (os corpos `.strict()` dos contratos recusariam). A rota faz o parse com este schema.
 */
export const WahaMessagePayloadSchema = z.looseObject({
  /** `true_<chatId>_<hash>` ou `false_<chatId>_<hash>`; o `<hash>` final é o id estável. */
  id: z.string().min(1).max(300),
  from: z.string().max(200).nullish(),
  fromMe: z.boolean().nullish(),
  body: z.string().max(10_000).nullish(),
  _data: z
    .looseObject({
      Info: z.looseObject({ SenderAlt: z.string().max(200).nullish() }).nullish(),
      Message: z
        .looseObject({
          listResponseMessage: z
            .looseObject({ singleSelectReply: z.looseObject({ selectedRowID: z.string().max(200).nullish() }).nullish() })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
export type WahaMessagePayload = z.infer<typeof WahaMessagePayloadSchema>;

export const WahaWebhookEventSchema = z.looseObject({
  event: z.string().max(100),
  session: z.string().max(100).nullish(),
  /** Só é lido como mensagem quando `event = "message"` (WahaMessagePayloadSchema). */
  payload: z.unknown(),
});
export type WahaWebhookEvent = z.infer<typeof WahaWebhookEventSchema>;

/**
 * E47 · POST /webhooks/waha · WAHA (webhook da sessão) · RN18
 * Sem login e sem CSRF; valida `X-Webhook-Hmac` antes de ler o JSON (inválida → 401). Responde 200 em menos de 10 s.
 * Só trata `event: "message"` que não seja `fromMe` nem de grupo (`@g.us`).
 */
export const E47 = defineEndpoint({
  code: 'E47',
  method: 'POST',
  path: '/webhooks/waha',
  auth: 'public',
  csrf: false,
  response: OkSchema,
});
