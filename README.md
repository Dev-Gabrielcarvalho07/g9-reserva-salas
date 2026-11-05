# G9 · Sistema de Reserva de Salas de Reunião

Aplicação **fullstack** de uso interno (single tenant) para operadores cadastrarem salas, recursos de infraestrutura (projetores, TVs etc.) e reservas por horário. O foco do projeto é **administração, segurança e programação avançada no PostgreSQL**.

**Stack:** Java 21 + Spring Boot 3.3 · React 18 (Vite) · PostgreSQL 16 · PgBouncer · Nginx · Docker Compose

---

## Como executar

Pré-requisito: **Docker Desktop** (ou Docker Engine + Compose v2).

```bash
git clone https://github.com/Dev-Gabrielcarvalho07/g9-reserva-salas.git
cd g9-reserva-salas
docker compose up --build
```

| Serviço | Endereço |
|---|---|
| **Aplicação (SPA)** | http://localhost:3000 |
| API REST | http://localhost:8080/api |
| PostgreSQL / PgBouncer | não expostos no host (só rede interna) |

> O `bd/backup.sql` roda automaticamente **apenas na primeira subida** (volume vazio).
> Para recriar o banco do zero: `docker compose down -v && docker compose up --build`

---

## Credenciais de teste

### Operadores da aplicação (login na SPA)

| Login | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | ADMIN |
| `operador` | `operador123` | OPERADOR |

### Usuários do banco

| Usuário | Senha | Role | Uso |
|---|---|---|---|
| `postgres` | `Postgres@G9_2026` | superusuário | administração (só via socket local) |
| `app_user` | `App@G9_2026` | `rl_escritor` | backend Spring Boot |
| `relatorio_user` | `Relatorio@G9_2026` | `rl_leitor` | consultas somente leitura |
| `pgbouncer_admin` | `Admin@Pool_2026` | console do PgBouncer | `SHOW POOLS`, `SHOW STATS` |

> Credenciais fixas por se tratar de ambiente acadêmico. Em produção ficariam em variáveis de ambiente/secrets.

---

## Arquitetura

```
 Navegador
    │  http://localhost:3000
    ▼
┌──────────────┐  /api   ┌──────────────┐  JDBC   ┌──────────────┐        ┌──────────────┐
│  frontend    │ ──────► │   backend    │ ──────► │  pgbouncer   │ ─────► │      db      │
│ Nginx+React  │         │ Spring Boot  │ Hikari  │  pool trans. │ scram  │ PostgreSQL 16│
│ 172.28.0.40  │         │ 172.28.0.30  │ (10)    │ 172.28.0.20  │        │ 172.28.0.10  │
└──────────────┘         └──────────────┘         └──────────────┘        └──────────────┘
                          rede Docker isolada "g9_net" (172.28.0.0/24)
```

- O **Nginx** serve o React e faz proxy de `/api` → backend (sem CORS).
- O **backend nunca acessa o Postgres direto**: passa pelo **PgBouncer** (porta 6432).
- O **pg_hba.conf** só aceita conexões de rede vindas do IP do PgBouncer.
- O banco **não publica porta** no host.

---

## Estrutura do repositório

```
g9-reserva-salas/
├── docker-compose.yml        # db, pgbouncer, backend, frontend
├── bd/
│   ├── postgresql.conf       # timeouts, logs, scram, tuning
│   ├── pg_hba.conf           # isolamento por IP + scram-sha-256
│   ├── backup.sql            # DDL, DML, functions, procedure, triggers, views, roles, seeds
│   └── demo.sql              # roteiro de demonstração dos recursos do banco
├── pgbouncer/                # Dockerfile, pgbouncer.ini, userlist.txt
├── backend/                  # API REST Spring Boot (Java 21)
└── frontend/                 # SPA React + Vite, servida por Nginx
```

---

## Requisitos de banco de dados implementados

| Requisito | Implementação | Onde |
|---|---|---|
| **Schemas** | `reserva` (negócio), `seguranca` (operadores), `audit` (trilha) | `backup.sql` §3 |
| **Roles / RBAC** | `rl_leitor` (SELECT) e `rl_escritor` (herda leitor + escrita + EXECUTE); usuários `app_user` e `relatorio_user` | `backup.sql` §9 |
| **Pool de conexões** | PgBouncer em `pool_mode = transaction` (pool 10, máx. 30 no banco) + HikariCP tunado no backend | `pgbouncer/pgbouncer.ini`, `application.yml` |
| **Timeouts** | `statement_timeout = 15s` (global) / `5s` (app_user) / `3s` (relatorio_user); `idle_in_transaction_session_timeout = 20s`; `lock_timeout = 10s` | `postgresql.conf`, `backup.sql` §9 |
| **pg_hba.conf** | Só o IP do PgBouncer (`172.28.0.20`) conecta pela rede; `postgres` remoto rejeitado; tudo com `scram-sha-256` | `bd/pg_hba.conf` |
| **SQL Injection** | Spring Data JPA + `JdbcTemplate` com parâmetros `?` (Prepared Statements) | backend |
| **Hardening** | `REVOKE ALL ON SCHEMA public FROM PUBLIC`; app sem acesso à tabela de operadores nem ao schema `audit` para escrita | `backup.sql` §2, §9 |
| **Auditoria** | Trigger genérico grava INSERT/UPDATE/DELETE em `audit.log_alteracao` (JSON antes/depois, usuário do banco e operador da aplicação) | `backup.sql` §7.2 |
| **Function** | `reserva.fn_sala_disponivel` e `seguranca.fn_autenticar` | `backup.sql` §5 |
| **Procedure** | `reserva.sp_reservar_sala` | `backup.sql` §6 |
| **Triggers** | `trg_valida_reserva` (bloqueia choque de horário) e `trg_audit_reserva` / `trg_audit_sala` | `backup.sql` §7 |
| **Views** | `reserva.vw_reservas_hoje` e `reserva.vw_salas_livres_agora` | `backup.sql` §8 |
| **Criptografia** | `pgcrypto`: senhas dos operadores com bcrypt (`crypt` + `gen_salt('bf')`), conferidas dentro do banco | `backup.sql` §1, §5.2, §10 |

### Específico do G9

- **Controle de concorrência com `SELECT ... FOR UPDATE`:** a procedure trava a linha da sala; duas reservas simultâneas para a mesma sala entram em fila e a segunda é recusada se houver choque de horário. Salas diferentes não se bloqueiam.
- **`idle_in_transaction_session_timeout = 20s`:** derruba transações abandonadas, impedindo que uma sessão esquecida segure o lock de uma sala.

---

## API REST (principais rotas)

Todas exigem `Authorization: Bearer <token>`, exceto o login.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login (valida com `fn_autenticar`) |
| GET/POST/PUT/DELETE | `/api/salas` | CRUD de salas |
| GET/POST/DELETE | `/api/recursos` | Recursos das salas |
| GET/POST/PUT/DELETE | `/api/reservas` | CRUD de reservas (criação via procedure) |
| PATCH | `/api/reservas/{id}/cancelar` | Cancela reserva |
| GET | `/api/relatorios/salas-agora` | View `vw_salas_livres_agora` |
| GET | `/api/relatorios/reservas-hoje` | View `vw_reservas_hoje` |
| GET | `/api/relatorios/disponibilidade` | Function `fn_sala_disponivel` |
| GET | `/api/relatorios/auditoria` | Últimos 50 registros de auditoria |
| GET | `/api/relatorios/teste-timeout?segundos=7` | Demonstra o `statement_timeout` |

---

## Demonstração dos recursos do banco

O arquivo [`bd/demo.sql`](bd/demo.sql) traz o roteiro completo. Para abrir o psql como administrador:

```bash
docker exec -it -e PGPASSWORD=Postgres@G9_2026 g9-db psql -U postgres -d g9_reservas
```

Principais demonstrações: permissões por role, pgcrypto, function, views, trigger de validação, **concorrência com dois terminais**, `idle_in_transaction`, `statement_timeout`, auditoria, PgBouncer (`SHOW POOLS`) e bloqueio do `pg_hba.conf`.

---

## Equipe

- Gabriel Carvalho de Oliveira
- João Pedro Abdala
- Maria Eduarda
- Yan Santos_
