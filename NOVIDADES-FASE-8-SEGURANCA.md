# A&C Moda — Fase 8: segurança reforçada

Esta fase interrompe novas integrações e endurece a base existente antes dos testes de venda.

## Proteções implementadas

- Senha administrativa armazenada como hash PBKDF2, sem senha em texto em produção.
- Sessão assinada, curta, vinculada ao navegador e armazenada em cookie HttpOnly/Secure.
- Bloqueio progressivo de tentativas de login e limites contra automação nas APIs.
- Proteção de origem/CSRF em todas as alterações administrativas.
- Content Security Policy com nonce, bloqueio de iframe e cabeçalhos HTTP de segurança.
- Upload de imagens validado pelo conteúdo real, reprocessado e limitado a JPG/PNG/WebP.
- Preços, estoque, frete e total confirmados no servidor antes de abrir o pagamento.
- Retornos de pagamento validados no servidor e protegidos contra processamento duplicado.
- Webhook do Melhor Envio recusado quando não há assinatura configurada.
- Auditoria de logins, alterações administrativas e falhas sensíveis.
- RLS e permissões do Supabase endurecidas; navegador sem acesso direto às tabelas administrativas.
- Página `/admin/seguranca` com checklist e últimos eventos de auditoria.
- Next.js atualizado para 16.2.10 e PostCSS fixado em versão corrigida.
- `npm audit` sem vulnerabilidades conhecidas no momento da entrega.

## Limite desta fase

O painel ainda usa um único acesso administrativo. Ele é adequado para os testes locais, mas contas individuais com MFA serão a próxima etapa de segurança antes da publicação pública.
