---
title: "sealed-secrets"
date: 2026-04-27
categories: ["infra"]
tags: ["sealed"]
draft: false
---


## 개요

- sealed secrets는 k8s에서 중요한 key,value를 암호화하기 위해서 사용되는 소프트웨어
- Git에 중요한 값을 올려야하는 경우 암호화를 통해 올려야하고, git에 올려야하는 이유는 argocd가 이 key 값들을 읽어야 app에 적용을 시킬 수 있기 때문이다

## 설치 방법 


```bash
brew install kubeseal
```


## 암호화 방법

- 중요한 chart ex) postgresql, redis 같은 데이터베이스 chart들은 비밀번호등 중요한 값이 필요로 하게 됨

```bash
# 1. 일반 K8s Secret을 kubeseal로 암호화
kubectl create secret generic pgadmin-secret \
  --from-literal=email=$PGADMIN_EMAIL \
  --from-literal=password=$PGADMIN_PASSWORD \
  --namespace database \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > \
  ~/dg/whereToday/infra/charts/pgadmin/templates/sealed-secret.yaml
```


```bash
cat ~/dg/whereToday/infra/charts/pgadmin/templates/sealed-secret.yaml
```

- 이런식으로 하나하나 만들고 일일히 암호화가 됐는지 확인을 해야하는데 번거로움으로 secret.sh를 만들어서 한 번에 암호화 할 수 있게 설정
