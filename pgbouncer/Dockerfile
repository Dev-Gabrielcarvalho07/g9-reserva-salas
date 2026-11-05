FROM alpine:3.20

RUN apk add --no-cache pgbouncer postgresql16-client \
 && (addgroup -S pgbouncer 2>/dev/null || true) \
 && (adduser -S -D -H -G pgbouncer pgbouncer 2>/dev/null || true)

COPY pgbouncer.ini userlist.txt /etc/pgbouncer/
RUN chown -R pgbouncer:pgbouncer /etc/pgbouncer && chmod 600 /etc/pgbouncer/userlist.txt

USER pgbouncer
EXPOSE 6432
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
