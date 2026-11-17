# Fase 7 — InfinitePay

- Checkout Integrado da InfinitePay substituindo o Mercado Pago.
- Pix e cartão em até 12x no ambiente seguro da InfinitePay.
- Tela `/admin/pagamentos` para configurar a InfiniteTag sem editar código.
- Pedido criado e estoque reservado antes de abrir o pagamento.
- Verificação do pagamento pela API `payment_check`.
- Conferência obrigatória do valor recebido contra o total salvo no pedido.
- Webhook idempotente em `/api/webhooks/infinitepay`.
- Confirmação também no retorno do cliente, útil em testes locais.
- Comprovante, método, parcelas e valor confirmado no painel do pedido.
- Nenhum dado completo de cartão é recebido ou armazenado pela loja.
