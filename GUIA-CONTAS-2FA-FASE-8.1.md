# A&C Moda — Fase 8.1: contas individuais e 2FA

## O que muda

- A senha compartilhada da Fase 8 passa a servir somente para o primeiro acesso.
- Cada administradora recebe um convite no próprio e-mail.
- Cada conta cria uma senha exclusiva e configura um aplicativo autenticador.
- Desativar uma conta ou encerrar sessões não afeta as demais.
- As alterações administrativas ficam associadas ao e-mail responsável.

## Antes do primeiro convite

No Supabase, abra **Authentication > URL Configuration** e configure:

- Site URL local: `http://localhost:3000`
- Redirect URLs:
  - `http://localhost:3000/admin/aceitar-convite`
  - `http://localhost:3000/admin/redefinir-senha`

Quando publicar, acrescente também as mesmas rotas usando `https://aecmoda.com.br`.

## Primeiro acesso

1. Execute `MIGRACAO-FASE-8.1-CONTAS-2FA.sql` no SQL Editor.
2. Inicie a loja e entre em `/admin` usando a senha protegida da Fase 8, sem e-mail.
3. Abra **Contas e acessos** e convide a primeira proprietária.
4. Abra o e-mail recebido, crie a senha e volte ao login.
5. No primeiro login individual, escaneie o QR Code com Google Authenticator, Microsoft Authenticator ou aplicativo compatível.
6. Depois da ativação da primeira conta, a senha compartilhada deixa de funcionar automaticamente.

## E-mails do Supabase

O envio padrão do Supabase é adequado para testes e possui limites. Antes do lançamento, configure um SMTP próprio em **Authentication > Email > SMTP Settings** para melhorar a entrega de convites e recuperações.

## Recuperação

Na tela de login, use **Esqueci minha senha**. A troca invalida as sessões antigas da conta. Caso uma administradora perca o celular autenticador, uma proprietária pode usar **Redefinir 2FA** em Contas e acessos.
