# Integração local do broker

```sh
bun run --filter backend test:integration
```

O runner compartilhado prepara RabbitMQ e PostgreSQL descartáveis, com portas locais dinâmicas e namespace exclusivo. O teste reinicia somente seu container dedicado. Nenhum worker de taxas externas é iniciado.

O teste valida publicação confirmada, mensagem persistida durante restart, reconexão dos consumidores, receipt persistente contra duplicação, recuperação após retry e DLQ confirmada. Unitários adicionais simulam perda de confirmação e verificam que mensagem original permanece sem ACK.

Topologia exige quorum queues com dead-letter `at-least-once` e overflow `reject-publish`. Nenhuma instalação compartilhada é alterada pelos testes. Instruções gerais: [docs/testing.md](../../../../../../../docs/testing.md).
