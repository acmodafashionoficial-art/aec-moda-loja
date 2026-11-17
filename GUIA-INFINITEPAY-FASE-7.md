# A&C Moda — ativação da InfinitePay

## 1. Atualizar o banco
No SQL Editor do Supabase, execute uma vez o arquivo `MIGRACAO-FASE-7.sql`.

## 2. Habilitar o checkout na InfinitePay
No App ou na conta web:

1. Abra **Vendas**.
2. Entre em **Checkout**.
3. Abra **Configurações**.
4. Toque em **Habilitar Checkout Integrado**.
5. Anote a **InfiniteTag** que aparece na conta, sem o símbolo `$`.

## 3. Configurar no painel da loja
Abra:

`http://localhost:3000/admin/pagamentos`

Informe a InfiniteTag, marque **Ativar vendas pela InfinitePay** e salve.

Não existe token secreto obrigatório para criar o checkout integrado. O site identifica a conta pela InfiniteTag e valida cada pagamento consultando a API da InfinitePay.

## 4. Teste local
Em `localhost`, o webhook não pode ser acessado pela InfinitePay. Mesmo assim, quando o cliente conclui o pagamento e volta ao site, a loja consulta `payment_check`, confere o valor e só então aprova o pedido.

Não feche a tela de pagamento antes de clicar em **Continuar** e voltar para a loja durante os testes locais.

## 5. Depois da publicação
Quando `NEXT_PUBLIC_SITE_URL` usar HTTPS, o checkout envia automaticamente:

`https://SEU-DOMINIO/api/webhooks/infinitepay`

O webhook também é validado por uma consulta direta à InfinitePay antes de baixar estoque.
