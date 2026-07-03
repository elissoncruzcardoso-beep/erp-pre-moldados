# Deploy e Proxy

Este ERP roda hoje na Vercel. Nesse ambiente, headers como `x-forwarded-for`
sao controlados pela plataforma.

Se o sistema for migrado para VPS, Nginx ou outro proxy proprio, o proxy precisa
sobrescrever o IP de origem antes de encaminhar para o Next.js. Isso evita que
um cliente envie um `x-forwarded-for` falso e burle o rate limit de login.

Exemplo Nginx:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

Regra: sobrescrever o header, nao anexar valores recebidos do cliente.
