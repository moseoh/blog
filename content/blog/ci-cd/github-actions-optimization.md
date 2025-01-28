---
title: "GitHub Actions: 로컬 캐싱으로 빌드 최적화"
type: blog
date: 2025-01-26
tags:
  - ci/cd
summary: ""
weight: 1
---

## 개요

목표 빌드 순서

1. Gralde Build (Spring Boot)
2. Docker Build

## Github Actions Workflows

Github Actions Runner Workflows 의 순서와 수행시간을 살펴 보겠습니다.

### Clean Build

다양한 빌드 도구들은 여러번 빌드하는 경우 기존 파일들을 참조합니다. 따라서 최초 빌드시 시간이 가장 오래 걸립니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/clean-build-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>빌드를 처음 실행하는 경우</figcaption>
</figure>

| 단계                    | 평균   | 수행 시간 1 | 수행 시간 2 | 수행 시간 3 |
| ----------------------- | ------ | ----------- | ----------- | ----------- |
| Set up job              | 4s     | 4s          | 4s          | 4s          |
| Run actions/checkout@v4 | 1.67s  | 2s          | 1s          | 2s          |
| JDK 17 설정             | 5.67s  | 5s          | 6s          | 6s          |
| 빌드 실행 (Gradle)      | 3m 0s  | 2m 31s      | 3m 20s      | 2m 51s      |
| Set up QEMU             | 12.67s | 11s         | 12s         | 15s         |
| Set up Docker Buildx    | 8s     | 7s          | 8s          | 9s          |
| 빌드 실행 (Docker)      | 1m 40s | 1m 36s      | 1m 37s      | 1m 48s      |

기존 파일이 존재하지 않는 환경에서 총 세번의 수행시간을 확인해 보았습니다. 각 Build Step을 자세히 살펴 성능 개선을 할 수 있는 부분을 살펴보겠습니다.

{{% steps %}}

#### Set up job

Set up job은 Github Actions 실행시 자동으로 할당되는 step으로 Workflows에 필요한 actions를 다운로드 합니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Set up job</figcaption>
</figure>

다운로드한 actions는 아래 경로에 저장됩니다.

```shell
root@2c20acb03c37:/_work/github-runner-1/_actions# pwd
/_work/github-runner-1/_actions
root@2c20acb03c37:/_work/github-runner-1/_actions# ls -ls
total 8
4 drwxr-xr-x 4 root root 4096 Jan 26 12:04 actions
4 drwxr-xr-x 5 root root 4096 Jan 26 12:04 docker
root@2c20acb03c37:/_work/github-runner-1/_actions# ls -ls actions/
total 8
4 drwxr-xr-x 3 root root 4096 Jan 26 12:04 checkout
4 drwxr-xr-x 3 root root 4096 Jan 26 12:04 setup-java
root@2c20acb03c37:/_work/github-runner-1/_actions# ls -ls docker/
total 12
4 drwxr-xr-x 3 root root 4096 Jan 26 12:04 build-push-action
4 drwxr-xr-x 3 root root 4096 Jan 26 12:04 setup-buildx-action
4 drwxr-xr-x 3 root root 4096 Jan 26 12:04 setup-qemu-action
root@2c20acb03c37:/_work/github-runner-1/_actions#
```

#### Run actions/checkout@v4

actions/checkout은 작업할 저장소를 fetch 해옵니다. fetch전에 `Deleting the contents of '...'` 에서 기존 파일들을 삭제하는 모습입니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>actions/checkout@v4</figcaption>
</figure>

- Repository Checkout

#### JDK 17 설정

JDK actions 에서는 설정된 JDK 버전을 내려받고, 압축을 해제하고 Java를 설정하는 단계를 거칩니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-3.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>JDK 17 설정</figcaption>
</figure>

#### 빌드 실행 (Gradle)

Gradle 빌드를 실행하기전에 gradle을 다운로드하고 build를 실행하게 됩니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-4.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>빌드 실행 (Gradle)</figcaption>
</figure>

Gradle 다운로드 경로는 local에서 진행할때와 동일하였습니다. github actions 에서 별도로 설정한 것이 아닌 JDK 설정이후 spring boot 프로젝트에 포함된 `./gradlew` 을 사용하기 때문입니다.

```shell
root@2c20acb03c37:~/.gradle/wrapper/dists# ls -al
total 16
drwxr-xr-x 3 root root 4096 Jan 26 10:56 .
drwxr-xr-x 3 root root 4096 Jan 26 10:56 ..
-rw-r--r-- 1 root root 181 Jan 26 10:56 CACHEDIR.TAG
drwxr-xr-x 3 root root 4096 Jan 26 10:56 gradle-8.10.2-bin
root@2c20acb03c37:~/.gradle/wrapper/dists#
```

#### Set up QEMU, Docker Buildx

Docker image를 멀티 아키텍쳐로 빌드하기 위한 스텝입니다. QEMU 설치에 필요한 Docker image를 받고 QEMU binaries를 설치하고 buildx builder를 구성합니다.

Qemu는 Docker image를 다운로드 받는데 Buildx는 별도로 다운로드 하지 않습니다. 이는 최신 docker 에서는 buildx를 함께 제공하기 때문에 이미 설치된 상태이기 때문입니다. host 서버에서 아래 명령어를 통해 확인할 수 있습니다.

```shell
# https://github.com/docker/buildx
moseoh@worker:~$ docker buildx version
github.com/docker/buildx v0.19.3 48d6a39
```

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-5.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Set up QEMU, Docker Buildx</figcaption>
</figure>

#### 빌드 실행 (Docker)

Docker build 생성 로그는 일부분만 가져왔습니다. Docker build에서는 크게 `From` 에 할당된 기반이미지 다운로드와 Layer Caching이 존재합니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-6.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>빌드 실행 (Docker)</figcaption>
</figure>

{{% / steps %}}

### Re-Build

최초 빌드가 아닌 두번째 빌드에서는 어떻게 작업을 진행하는지 살펴보겠습니다.

| 단계                    | 평균   | 수행 시간 1 | 수행 시간 2 | 수행 시간 3 |
| ----------------------- | ------ | ----------- | ----------- | ----------- |
| Set up job              | 5s     | 6s          | 4s          | 5s          |
| Run actions/checkout@v4 | 1s     | 1s          | 1s          | 1s          |
| JDK 17 설정             | 0s     | 0s          | 0s          | 0s          |
| 빌드 실행 (Gradle)      | 33.33s | 34s         | 33s         | 33s         |
| Set up QEMU             | 11s    | 13s         | 11s         | 9s          |
| Set up Docker Buildx    | 3s     | 3s          | 3s          | 3s          |
| 빌드 실행 (Docker)      | 1m 40s | 1m 47s      | 1m 38s      | 1m 37s      |

최초 빌드와 시간 차이를 확인해 보았습니다.

| 단계                    | Clean Build | Re-Build | 시간 단축 |
| ----------------------- | ----------- | -------- | --------- |
| Set up job              | 4s          | 5s       | + 1s      |
| Run actions/checkout@v4 | 1.67s       | 1s       | - 0.67s   |
| JDK 17 설정             | 5.67s       | 0s       | - 5.67s   |
| 빌드 실행 (Gradle)      | 180s        | 33.33s   | - 146.67s |
| Set up QEMU             | 12.67s      | 11s      | - 1.67s   |
| Set up Docker Buildx    | 8s          | 3s       | - 5s      |
| 빌드 실행 (Docker)      | 100s        | 100s     | 0s        |

해당 표를 확인하면 별도의 설정없이 재빌드만으로 작업 시간 단축이 된 step이 존재합니다. github actions 의 cache가 아닌 actions runner가 self-hosted 됨으로써 hosted의 자원을 재사용하기 때문인데요, 일단 표를 통해 간단히 예상해 보겠습니다.

- Set up job 유의미한 차이는 없습니다.
- Run actions/checkout@v4 유의미한 차이는 없습니다.
- JDK 는 6s 차이도 있지만 Re-Build 시 0s 로 다운로드나 캐싱이 아닌 완전히 재사용하는 것을 기대할 수 있습니다.
- Gradle 빌드 또한 이전 wrapper를 재사용하는 것으로 기대됩니다.
- Set up Qemu와 Buildx는 좀더 자세히 살펴봐야할 것 같습니다.
- Docker build의 경우 동일한 수행시간을 보여줍니다. 로컬에서 Docker build를 여러번 하는경우 Layer 캐시를 사용하지만 github actions 환경에서는 캐싱을 하지 않는 것으로 예상됩니다.

위에서 예상한것을 토대로 재빌드시 어떻게 작업이 진행되는지 확인해 보겠습니다.

#### Set up job

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Set up job</figcaption>
</figure>

runner의 작업폴더에 actions를 다운로드 받지만 이를 재사용하지는 않습니다.

```shell
# 실행 전
root@2c20acb03c37:/_work/github-runner-1/_actions# ll
total 16
drwxr-xr-x 4 root root 4096 Jan 26 12:16 ./
drwxr-xr-x 6 root root 4096 Jan 26 12:16 ../
drwxr-xr-x 4 root root 4096 Jan 26 12:16 actions/
drwxr-xr-x 5 root root 4096 Jan 26 12:16 docker/

# 실행 후
root@2c20acb03c37:/_work/github-runner-1/_actions# ll
total 16
drwxr-xr-x 4 root root 4096 Jan 26 13:10 ./
drwxr-xr-x 6 root root 4096 Jan 26 13:10 ../
drwxr-xr-x 4 root root 4096 Jan 26 13:10 actions/
drwxr-xr-x 5 root root 4096 Jan 26 13:10 docker/
```

`_actions` 폴더에 actions 파일들이 있지만 이를 삭제하고 새로 다운로드 받는 것으로 보이지만 이과정이 logs에는 보이지 않네요. Set up Job의 경우 공식문서에서도 cache에 대한 안내는 없으며 관련 내용의 [이슈](https://github.com/actions/runner/issues/2782)는 열려있는채로 남겨져 있습니다.

- actions 다운로드: 개선 없음

#### Run actions/checkout@v4

Repository Checkout 에서 기존 브랜치를 초기화 하는 과정이 있지만 기존 코드들을 전부 삭제하지는 않습니다.

```shell
root@2c20acb03c37:/_work/github-runner-1/test/test# ll
total 212
drwxr-xr-x 9 root root  4096 Jan 26 13:11 ./
drwxr-xr-x 3 root root  4096 Jan 26 10:56 ../
drwxr-xr-x 7 root root  4096 Jan 26 13:11 build/           # <-- 이번 빌드에 생긴 파일
-rw-r--r-- 1 root root  3696 Jan 26 10:56 build.gradle.kts # <-- 기존 파일
...
```

대신에 `git clean` 명령어를 통해 이전 빌드에서 사용한 파일들을 삭제하는 데요, 이는 빌드시 기존 빌드파일에 영향을 받지 않기 위해서 삭제를 진행합니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Run actions/checkout@v4</figcaption>
</figure>

Spring Boot 프로젝트의 경우 build 파일이 존재할 때, 기존 빌드파일을 활용하여 build 시간을 단축시킬 수 있기 때문에, 재빌드 하더라도 영향이 없도록 build process가 검증되어있다면 해당 옵션을 변경하여 성능을 개선할 수 있습니다.

https://github.com/actions/checkout

```yaml
# Whether to execute `git clean -ffdx && git reset --hard HEAD` before fetching
# Default: true
clean: ""
```

- Repository Checkout
  - 브랜치 초기화: 개선 없음
  - 코드를 완전히 새로 받지는 않음: 코드가 이미 존재 한다면 변경된 코드를 내려 받음
  - build 파일 제거 (git 에서 관리되지 않는 파일 제거): Spring Boot Build 의 경우 기존 build 파일이 있다면 build 시간 단축

#### JDK 17 설정

JDK 설정에서는 `5.67s ->	0s` 의 속도 변화를 보여주었습니다. 아래 로그를 살펴보면 `Resolved Java 17.0.14+7.1 from tool-cache` 라는 로그가 존재합니다. tool-cache로 부터 JDK를 불러왔기 때문에 추가적인 설치 과정을 생략할 수 있습니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-3.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>JDK 17 설정</figcaption>
</figure>

tool-cache 경로는 `${{ runner.tool_cache }}` 으로 확인할 수 있습니다.

```yaml
- name: 환경 변수 확인
  run: echo "${{ runner.tool_cache }}"
  # 결과 echo "/opt/hostedtoolcache"
```

```shell
root@2c20acb03c37:/opt/hostedtoolcache# ll
total 20
drwxr-xr-x 1 runner root 4096 Jan 26 10:59 ./
drwxr-xr-x 1 root   root 4096 Jan 26 01:24 ../
drwxr-xr-x 3 root   root 4096 Jan 26 10:59 docker.io--tonistiigi--binfmt/
drwxr-xr-x 3 root   root 4096 Jan 26 10:56 Java_Corretto_jdk/
```

- JDK 다운로드: `/opt/hostedtoolcache`

#### 빌드 실행 (Gradle)

Gradle 빌드 결과는 `180s -> 33.33s` 으로 약 2분 26초 단축으로 상당한 시간 단축을 보여 줍니다. 어떤 과정이 캐싱되는지 살펴보겠습니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-4-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>빌드 실행 (Gradle) Re-Build</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-4-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>빌드 실행 (Gradle) Clean Build</figcaption>
</figure>

1. gradle download

첫 빌드시에는 gradle을 다운로드하는 과정이 있으나 두번째 빌드 부터는 다운로드하지 않고 빌드를 수행합니다. Gradle Wrapper(gradlew)는 빌드에 필요한 Gradle 버전을 자동으로 관리합니다. 이 과정에서 다음과 같은 자체 검사 로직이 동작합니다. `gradlew` 에서는 `./gradle/wrapper/gradle-wrapper.properties` 명시된 url을 통해 gradle을 다운로드 받고 `~/.gradle` 에 저장하게 됩니다.

```shell
root@2c20acb03c37:~/.gradle/wrapper/dists# ll
total 16
drwxr-xr-x 3 root root 4096 Jan 26 10:56 ./
drwxr-xr-x 3 root root 4096 Jan 26 10:56 ../
-rw-r--r-- 1 root root  181 Jan 26 10:56 CACHEDIR.TAG
drwxr-xr-x 3 root root 4096 Jan 26 10:56 gradle-8.10.2-bin/
```

하지만 timestamp를 확인해 보면, download 과정에선 7초 정도밖에 소요되지 않습니다. gradle 다운로드 이외에 어디서 속도차이가 발생했을까요?

2. gradle build

gradle build 소요시간을 보면 첫 빌드시 2m 29s, 재빌드시 33s 으로 약 2분이 감소되었습니다. gradle build 시 `build.gradle` 에 작성된 의존성들을 다운로드 하는 과정에서 꽤 긴 시간이 소요됩니다. 의존성들은 `~/.gradle/cache/modules` 에 저장됩니다.

```shell
root@2c20acb03c37:~/.gradle/caches# ll
total 28
drwxr-xr-x 6 root root 4096 Jan 26 10:57 ./
drwxr-xr-x 8 root root 4096 Jan 26 10:56 ../
drwxr-xr-x 12 root root 4096 Jan 26 10:58 8.10.2/
-rw-r--r-- 1 root root 181 Jan 26 10:56 CACHEDIR.TAG
drwxr-xr-x 2 root root 4096 Jan 26 10:56 jars-9/
drwxr-xr-x 2 root root 4096 Jan 26 10:57 journal-1/
drwxr-xr-x 4 root root 4096 Jan 26 10:57 modules-2/ # <-- here
```

- gradle 다운로드: `~/.gradle/wrapper/dists`
- gradle build 캐싱: `~/.gradle/cache`
  - `--build-cache` 옵션 활성화

#### Set up QEMU, Docker Buildx

먼저 Set up QEMU 수행속도는 동일합니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-5-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Set up QEMU</figcaption>
</figure>

Set up QEMU에서는

1. Github Actions Cache에서 캐싱된 `tonistiigi/binfmt` 이미지를 내려받음.
2. `tool_cache`, docker cache 에 저장
3. 이미지 불러온 뒤 pull 작업으로 최신 이미지인지 확인
4. QEMU static binaries 설치

과정을 거치기 때문에 최초 빌드시와 재 빌드시의 수행시간 차이는 없습니다.

```shell
root@2c20acb03c37:/opt/hostedtoolcache# ll
total 20
drwxr-xr-x 1 runner root 4096 Jan 26 10:59 ./
drwxr-xr-x 1 root   root 4096 Jan 26 01:24 ../
drwxr-xr-x 3 root   root 4096 Jan 26 10:59 docker.io--tonistiigi--binfmt/
drwxr-xr-x 3 root   root 4096 Jan 26 10:56 Java_Corretto_jdk/
```

```shell
root@2c20acb03c37:~/.gradle/caches# docker images
REPOSITORY               TAG               IMAGE ID       CREATED        SIZE
myoung34/github-runner   latest            2c3c6eb582a7   2 days ago     2.05GB
moby/buildkit            buildx-stable-1   a72f628fa83e   6 weeks ago    206MB
dockereng/export-build   latest            80d39fe4b85b   6 months ago   23.4MB
tonistiigi/binfmt        latest            354472a37893   2 years ago    60.2MB
```

하지만 host의 `tool_cache` 와 `docker images` 목록에서 이미 `tonistiigi/binfmt` 이미지를 가지고 있기 때문에 github cache 과정이 불필요해 보입니다.

Set up Docker Buildx에서는 수행시간이 `7s -> 2s` 로 단축되었습니다. `Booting builder` 과정에서 `moby/buildkit:buildx-stable-1` 이미지를 다운받는데, 사전에 다운받은 이미지 Layer를 재사용하기 때문에 pulling에서 속도차이가 발생합니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-setupbuildx-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>setup-buildx-action Re-Build</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-setupbuildx-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>setup-buildx-action Clean Build</figcaption>
</figure>

- docker qemu image 다운로드
- qemu binaries 설치
- builder instance 생성
- builder image 다운로드

#### 빌드 실행 (Docker)

Docker 빌드 실행의 수행시간은 완전히 동일한데요. 아래 로그를 보면 Re-Build시에도 Base 이미지를 다시 다운로드 받고, Layer가 Cache 되지 않고 있습니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-builddocker.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>빌드 실행 (Docker)</figcaption>
</figure>

Docker build는 Docker Buildx 컨테이너에서 빌드가 동작되기 떄문에 빌드가 끝난 뒤 Buildx 컨테이너가 사라지면서 관련 파일도 재사용할 수 없게 됩니다.

- Docker Build 캐싱

---

최종적으로 개선가능한 부분을 정리해 보았습니다.

- [x] actions 다운로드
  - Path: `_work/{runner}/actions`
- [x] Repository Checkout
  - Repository Code fetch의 경우 Cache했을 때와 차이가 크지 않을 것으로 생각되고, 깨끗한 환경에서 Actions를 보장하기 위해 생략
- [x] JDK 다운로드
  - `runner.tool_cache` 경로에 다운로드된 JDK를 재사용
- [x] gradle 다운로드
  - `~/.gradle/wrapper/dists` 의 gradle 패키지를 재사용
- [ ] gradle build 캐싱
  - `~/.gradle/cache/module` 의 module을 재사용
  - build cache
- [ ] docker qemu image 다운로드
- [ ] qemu binaries 설치
- [ ] builder instance 생성
- [ ] builder image 다운로드
- [ ] Docker Build 캐싱

## 성능 개선

위에서 정리한 개선 가능한 부분들을 개선하여 최종적으로 빌드를 개선해 보겠습니다.

### gradle build 캐싱

앞선 재빌드 과정에서 기본적으로 아래 파일들을 캐싱하는 것을 확인하였습니다.

- gradle wrapper
- gradle cache module

여기서 `--build-cache` 옵션을 활용하여 gradle의 build cache 기능을 사용할 수 있습니다. 해당 옵션을 활성화한 경우 `~/.gradle/cache` 경로에 `build-cache` directory가 새로 생기게 됩니다.

```shell
root@2c20acb03c37:~/.gradle/caches# ll
total 28
drwxr-xr-x 6 root root 4096 Jan 26 10:57 ./
drwxr-xr-x 8 root root 4096 Jan 26 10:56 ../
drwxr-xr-x 12 root root 4096 Jan 26 10:58 8.10.2/
drwxr-xr-x 4 root root 4096 Jan 26 10:57 build-cache-1/ # <-- here
-rw-r--r-- 1 root root 181 Jan 26 10:56 CACHEDIR.TAG
drwxr-xr-x 2 root root 4096 Jan 26 10:56 jars-9/
drwxr-xr-x 2 root root 4096 Jan 26 10:57 journal-1/
drwxr-xr-x 4 root root 4096 Jan 26 10:57 modules-2/
```

해당 빌드 캐시는 Spring Boot build 결과물인 build directory와 별도로 생성됩니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-buildgradle-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>gradle build 캐싱 (Cache Miss)</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-buildgradle-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>gradle build 캐싱 (Cache Hit)</figcaption>
</figure>

`compileJava` 과정에서 두번의 cache를 활용하여 빌드 시간이 `36s -> 21s`로 15s 단축되었습니다.

### docker qemu image 다운로드

`setup-qemu-action`에서는 `setup-buildx-action`와 다르게 host의 이미지를 재사용하기 전에 github actions의 cache를 먼저 불러옵니다. 이과정에서 이미 host에 있는 이미지를 바로 사용하지 않고 불필요한 cache 다운로드로 수행시간이 증가하게 됩니다.

아래 문서에 따르면 `cache-image`가 기본적으로 활성화 되어있는데 해당 옵션을 비활성화 함으로서 불필요한 캐시를 줄여 속도를 향상 시킬 수 있습니다.

https://github.com/docker/setup-qemu-action

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-5-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>setup-qemu-action options</figcaption>
</figure>

`cache-image` 옵션을 `false`로 명시하여 수행시간을 측정해 보았습니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupqemu-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupqemu-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache 제거 (local image 사용)</figcaption>
</figure>

`cache-image=false` 옵션으로 이미 host에 다운받은 `tonistiigi/binfmt` 이미지를 활용함으로써 불필요한 캐시 다운로드 과정을 제거할 수 있습니다. 수행시간은 `11s -> 3s` 으로 단축되었습니다.

### qemu binaries 설치

binaries 설치를 캐싱한다고 생각했을 때, 그냥 'qemu를 설치해 둘 수는 없나?'라는 생각이 들었습니다. 사전 설치해둔다면

- docker qemu image pull
- install qemu binaries

두 과정을 생략할 수 있습니다.

docker qemu image pull은 로컬 이미지를 사용하여 수행시간을 줄였음에도 불구하고 docker pull 요청으로 최신 이미지를 확인하게 되는데 이 과정에서 [Docker pull rate limit](https://docs.docker.com/docker-hub/usage/)으로 문제가 발생할 수 있습니다.

```shell
/usr/bin/docker pull docker.io/tonistiigi/binfmt:latest
/usr/bin/docker run --rm --privileged docker.io/tonistiigi/binfmt:latest --install linux/amd64,linux/arm64
```

Set up Qemu의 로그를 보면 이미지를 다운받고 emulation 환경을 설정해주는데요, 이 과정을 self-hosted runner에 사전 설정하였습니다.

```shell
# runner
docker.io/tonistiigi/binfmt:latest --install all
```

다시 빌드를 돌려보면

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupqemu-3.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache 제거 (local image 사용)</figcaption>
</figure>

해당 과정을 통해 아래 두가지 작업을 생략하여 수행시간을 `3s` 줄이고 docker pull 1회를 아낄 수 있습니다.

### builder instance 생성, builder image 다운로드

setup-buildx-action 에서는 docker build를 위한 buildx builder를 생성해고 container를 실행합니다. 매 빌드시마다 builder container를 생성하여 독립된 빌드를 보장합니다. 따라서 builder instance는 프로비저닝하지 않고 현재 상태 그대로 매 빌드시마다 생성하여 독립된 빌드 환경을 구성하려고 합니다.

하지만 문제가 한가지 남아있는데요,

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupbuildx-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache 제거 (local image 사용)</figcaption>
</figure>

`--bootstrap` 으로 builder container 생성시 buildkit 이미지를 pull 한다는 것입니다. host에 이미 buildkit 이미지가 존재하여 다운로드 시간은 길지 않지만 여전히 docker pull rate limit 문제가 존재합니다.

buildx에서는 `pull=never` 같은 옵션을 지원하지 않고 [setup-buildx-action](https://github.com/docker/setup-buildx-action) 에서도 local 이미지를 활용할 수 있는 방법을 제공하지 않습니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupbuildx-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache 제거 (local image 사용)</figcaption>
</figure>

다만 image url을 설정할 수 있기 때문에 추후 사설 registry를 구축한다면 해당 옵션을 통해 문제를 해결할 수 있습니다.

### Docker build

Docker Build의 경우 최초 빌드와 재빌드시의 차이가 전혀 없었습니다. 로컬에서 재빌드 했을 때, Image Layer가 로컬에 남아있지만, Github Actions 에서는 Buildx로 빌드하고 해당 컨테이너를 정리하기 떄문에 cache된 것이 없기 떄문입니다.

[build-push-action](https://github.com/docker/build-push-action) 에서는 이러한 Layer cache 옵션을 제공합니다. `gha` type의 경우에는 cache 데이터를 actions cache에 저장할 수 있지만 여기서는 `local` 타입으로 캐싱을 지정하였습니다.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-builddocker-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache 제거 (local image 사용)</figcaption>
</figure>

```yaml
- name: 빌드 실행 (Docker)
  uses: docker/build-push-action@v6
  with:
    context: .
    push: false
    tags: |
      ${{ env.DOCKER_IMAGE_NAME }}:latest
      ${{ env.DOCKER_IMAGE_NAME }}:${{ github.sha }}
    platforms: linux/amd64,linux/arm64
    cache-from: type=local,src=/tmp/docker
    cache-to: type=local,dest=/tmp/docker
```

설정을 변경하고 빌드를 진행해보면,

```shell
root@2c20acb03c37:/tmp/docker# ll
total 24
drwxr-xr-x 4 root root 4096 Jan 28 15:19 ./
drwxrwxrwt 1 root root 4096 Jan 28 15:19 ../
drwxr-xr-x 3 root root 4096 Jan 28 15:14 blobs/
-rw-r--r-- 1 root root  299 Jan 28 15:19 index.json
drwxr-xr-x 2 root root 4096 Jan 28 15:19 ingest/
-rw-r--r-- 1 root root   30 Jan 28 15:19 oci-layout
```

layer들이 지정된 경로에 caching 되는 것을 확인할 수 있습니다. cache된 데이터를 확인하고 재빌드하였습니다.
수행시간을 확인해 보니, **cache 전 후 수행시간의 차이가 크게 발생하지 않았습니다.**

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-builddocker-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache 제거 (local image 사용)</figcaption>
</figure>

1. layer cached
2. base image pull

로그를 살펴보면, layer는 제대로 캐시 되었지만 base 이미지는 여전히 pull이 발생했기 때문입니다.

`cache-to`, `cache-from`은 build layer의 캐싱 동작이며 base image는 해당 이미지에 대한 캐싱 대상이 아닙니다. base image는 buildkit의 blob에 저장됩니다. self-hosted runner에서는 buildx container에서 빌드를 진행하기 때문에 container 안에 base image가 저장되고 build 종료시 컨테이너와 함께 삭제됩니다.

이를 해결하기 위해선 buildx container를 재사용하거나, buildx container의 cache 데이터를 따로 관리해야 합니다. buildx container에서 나온 데이터를 재사용하는 것과 buildx container를 재사용하는 것의 차이가 없다면 container를 재사용하는 방법이 쉬울 것 같습니다. 해당 과정은 다음시간에 알아보겠습니다.

### 마치며

| 단계                    | Build  | Build 개선 | 시간 단축 |
| ----------------------- | ------ | ---------- | --------- |
| Set up job              | 5s     | 5s         | 0s        |
| Run actions/checkout@v4 | 1s     | 1s         | 0s        |
| JDK 17 설정             | 0s     | 0s         | 0s        |
| 빌드 실행 (Gradle)      | 33.33s | 4s         | -29.33s   |
| Set up QEMU             | 11s    | -          | -11s      |
| Set up Docker Buildx    | 3s     | 3s         | 0s        |
| 빌드 실행 (Docker)      | 100s   | 118s       | +18s      |

최종적으로 코드 변경없이 재빌드하는 경우 약 `22s` 수행시간을 단축하였습니다. Docker 빌드의 경우 캐시과정이 추가되어 수행시간이 조금 늘어난 것은 아쉽지만, Base Image까지 처리하면 유의미한 시간차이를 낼 수 있을 것 같습니다.

아래는 이번 포스팅에서 진행한 build 개선 과정입니다.

- [x] actions 다운로드
  - Path: `_work/{runner}/actions`
- [x] Repository Checkout
  - Repository Code fetch의 경우 Cache했을 때와 차이가 크지 않을 것으로 생각되고, 깨끗한 환경에서 Actions를 보장하기 위해 생략
- [x] JDK 다운로드
  - `runner.tool_cache` 경로에 다운로드된 JDK를 재사용
- [x] gradle 다운로드
  - `~/.gradle/wrapper/dists` 의 gradle 패키지를 재사용
- [x] gradle build 캐싱

  - `~/.gradle/cache/module` 의 module을 재사용
  - `~/.gradle/cache/build-cache` 의 build cache 재사용 (`--build-cache` 옵션 활성화)

- [x] docker qemu image 다운로드
  - `cache-image=false` 옵션으로 불필요한 캐시 비활성화
  - qemu 사전 설정으로 사용하지 않음
- [x] qemu binaries 설치
  - qemu 사전 설정
- [x] builder instance 생성
  - 독립된 빌드 환경을 보장하기 위해 매번 새로 생성
- [ ] builder image 다운로드
  - 사설 Registry 구축 이후 image url 변경
- [x] Docker Build 캐싱
  - build layer local cache를 통한 캐시 데이터 저장
  - [ ] base image 는 buildkit container 에서 캐싱해야한다.

## 추가: 왜 actions cache는 사용하지 않았을까?

이번 포스팅에서는 github actions 에서 제공하는 cache 기능을 사용하지 않았습니다.

github actions 에서는 자체적으로 [actions cache](https://github.com/actions/cache) 기능을 제공합니다. 해당 actions를 사용하여 커스텀하게 caching을 할 수 있으며 `Set up QEMU` 같은 과정에서는 기본 설정으로 cache를 사용하기도 합니다.

일반적으로 이 기능을 사용하면, 빌드에 필요한 의존성을 원격으로 압축 저장 후 가져와 재활용할 수 있어 빌드 시간을 단축할 수 있습니다. 하지만 캐시 파일을 업로드/다운로드하는 과정 자체가 생각보다 오래 걸리고, 네트워크 상태나 GitHub Actions 인프라에 외부적으로 의존하게 된다는 단점이 있습니다. 네트워크 문제가 없더라도 일반적으로 네트워크를 통한 캐시를 제어하는 것 보다 로컬에서 제어하는 것이 속도 측면에서 이점도 있습니다. 추가적으로 actions cache의 사용량 또한 무제한이 아닌 문제도 존재합니다.

네트워크 관련 문제는 [Github Issue](https://github.com/actions/cache/issues/279) 에서 제안되었으나 기능 개발 예정이 없다고 합니다.
