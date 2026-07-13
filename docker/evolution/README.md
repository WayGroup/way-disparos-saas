# Evolution API — canal de envio dos grupos

A API oficial da Meta **não envia mensagens em grupos**. Nunca enviou. Grupo só é possível
via Baileys, que se conecta como um celular real. É isso que a Evolution faz.

Consequências que não somem:
- Precisa de um **número dedicado**. Nunca o número pessoal de ninguém.
- O número **pode ser banido**. Mitigamos com o jitter de 20–60s entre grupos e envio
  sequencial, mas o risco não vai a zero.

## 1. Subir

```bash
docker compose -f docker/evolution/docker-compose.yml up -d
```

Antes, troque `AUTHENTICATION_API_KEY` no compose por algo longo e aleatório:

```bash
openssl rand -hex 32
```

## 2. Criar a instância

O nome é livre — use o mesmo em `EVOLUTION_INSTANCE`.

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: SUA-CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"way","integration":"WHATSAPP-BAILEYS","qrcode":true}'
```

## 3. Apontar o app

No `.env.local` (ou nas variáveis da Vercel):

```
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=SUA-CHAVE
EVOLUTION_INSTANCE=way
```

## 4. Parear e sincronizar

Abra `/whatsapp` no app: gere o QR, escaneie no celular do número dedicado
(WhatsApp → Aparelhos conectados → Conectar aparelho). Quando o estado virar
**Conectado**, clique em **Sincronizar grupos**.

## Em produção

A Evolution precisa alcançar a URL pública do bucket `assets` do Supabase para baixar
as mídias. Se o container estiver em rede fechada, o envio com mídia falha — teste com
um `curl` da URL pública de dentro do container.
