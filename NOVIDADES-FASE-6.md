# Novidades da Fase 6

## Painel de pedidos

Acesse `/admin/pedidos` para pesquisar por código, nome, e-mail ou telefone e filtrar por status.

Status disponíveis:

- Aguardando pagamento
- Pagamento aprovado
- Separando pedido
- Pronto para retirada
- Pronto para envio
- Enviado
- Entregue
- Cancelado
- Reserva expirada
- Pagamento não aprovado

## Reserva de estoque

Ao iniciar o pagamento, as unidades ficam reservadas. O estoque disponível exibido na loja considera:

```text
estoque físico - estoque reservado
```

O tempo padrão é de 120 minutos e pode ser alterado em `.env.local`:

```env
ORDER_RESERVATION_MINUTES=120
```

## Consulta do cliente

A página `/acompanhar-pedido` exige o código do pedido e o e-mail usado na compra. Dados sensíveis, como CPF e endereço completo, não são devolvidos nessa consulta.

## Migração para a nuvem

A página `/admin/supabase` verifica:

- variáveis de ambiente;
- tabelas necessárias;
- buckets de imagens;
- disponibilidade do botão de migração.

A migração envia produtos, imagens locais, logo e configurações para o Supabase.
