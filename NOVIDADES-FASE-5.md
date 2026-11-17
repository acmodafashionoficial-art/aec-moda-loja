# A&C Moda — novidades da Fase 5

## Central completa de fretes

A nova tela `/admin/fretes` reúne:

- conexão segura com o Melhor Envio;
- ambientes Sandbox e Produção;
- Correios PAC e SEDEX;
- transportadoras privadas opcionais;
- seleção individual dos serviços disponíveis;
- ordenação por recomendação, menor preço ou menor prazo;
- quantidade máxima de opções no checkout;
- prazo de preparação da loja;
- custo fixo de embalagem e ajuste percentual opcional;
- valor declarado, aviso de recebimento, mão própria e coleta;
- cadastro dos dados do remetente;
- teste de cotação real por CEP;
- etiquetas de “Mais barato” e “Mais rápido”.

## Segurança

- Não existe mais frete local demonstrativo.
- Sem conexão real, o checkout bloqueia a entrega em domicílio.
- A retirada no ponto físico permanece gratuita quando ativa.
- O servidor recalcula o frete antes do pagamento.
- Tokens OAuth são criptografados no armazenamento local ou no Supabase.
- O token é renovado automaticamente quando possível.
- Há endpoint de Webhook preparado para rastreamento do Melhor Envio.
- O checkout real também fica bloqueado enquanto o Mercado Pago não estiver conectado.

## Rotas novas

- `/admin/fretes`
- `/api/admin/shipping`
- `/api/admin/shipping/services`
- `/api/admin/shipping/test`
- `/api/admin/melhor-envio/connect`
- `/api/admin/melhor-envio/callback`
- `/api/admin/melhor-envio/disconnect`
- `/api/webhooks/melhor-envio`
