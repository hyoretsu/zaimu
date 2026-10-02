# Integração local do broker

Teste opt-in usa exclusivamente broker dedicado `127.0.0.1:5675`, container `zaimu-validation-rabbit-0012` e banco local `zaimu_performance_codex_0012`. Reinicia somente esse container; nenhum worker de taxas externas é iniciado.

```sh
BROKER_TEST_URL=amqp://127.0.0.1:5675 \
DATABASE_URL=postgresql://usuario:senha@127.0.0.1:25681/zaimu_performance_codex_0012 \
bun test --timeout 150000 src/shared/infra/broker/tests/RabbitMqBroker.integration.test.ts
```

Banco precisa conter migrações atuais. Broker deve ser exclusivo do teste. Teste valida publicação confirmada, mensagem persistida durante restart, reconexão dos consumidores, receipt persistente contra duplicação, recuperação após retry e DLQ confirmada. Unit tests adicionais simulam perda de confirmação e verificam que mensagem original permanece sem ACK.

Topologia exige quorum queues com dead-letter `at-least-once` e overflow `reject-publish`. Ao atualizar uma instalação com filas anteriores, drene e recrie filas com novos argumentos antes de iniciar worker; declarações incompatíveis são recusadas pelo RabbitMQ. Nenhuma instalação compartilhada é alterada pelos testes.
