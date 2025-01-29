---
title: "GitHub Actions: Build Optimization with Local Caching"
type: blog
date: 2025-01-26
tags:
  - ci/cd
summary: "We optimized build times in GitHub Actions using a Self-hosted Runner. By identifying cacheable components at each build stage and implementing local caching, we significantly reduced build times. This post details how to eliminate unnecessary downloads and utilize caching in Gradle builds and Docker builds."
weight: 1
---

## Overview

In this post, we'll explore how to optimize the process of building a Spring Boot application and creating Docker images on a GitHub Actions Self-hosted Runner.

The main build stages are as follows:

1. Building Spring Boot application using Gradle
2. Building Docker images with multi-architecture support (amd64/arm64)

Let's analyze the current build times for each stage and examine how to reduce build times using local caching.

### Clean Build

Various build tools reference existing files when building multiple times. Therefore, the initial build takes the longest time.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/clean-build-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>First time build execution</figcaption>
</figure>

| Stage                   | Average | Time 1 | Time 2 | Time 3 |
| ----------------------- | ------- | ------ | ------ | ------ |
| Set up job              | 4s      | 4s     | 4s     | 4s     |
| Run actions/checkout@v4 | 1.67s   | 2s     | 1s     | 2s     |
| Setup JDK 17            | 5.67s   | 5s     | 6s     | 6s     |
| Run build (Gradle)      | 3m 0s   | 2m 31s | 3m 20s | 2m 51s |
| Set up QEMU             | 12.67s  | 11s    | 12s    | 15s    |
| Set up Docker Buildx    | 8s      | 7s     | 8s     | 9s     |
| Run build (Docker)      | 1m 40s  | 1m 36s | 1m 37s | 1m 48s |

We measured the execution time three times in an environment without existing files. Let's examine each Build Step in detail to identify potential performance improvements.

{{% steps %}}

#### Set up job

Set up job is automatically assigned when running Github Actions and downloads the actions needed for Workflows.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Set up job</figcaption>
</figure>

While actions are downloaded to the runner's working directory, they are not reused.

```shell
# Before execution
root@2c20acb03c37:/_work/github-runner-1/_actions# ll
total 16
drwxr-xr-x 4 root root 4096 Jan 26 12:16 ./
drwxr-xr-x 6 root root 4096 Jan 26 12:16 ../
drwxr-xr-x 4 root root 4096 Jan 26 12:16 actions/
drwxr-xr-x 5 root root 4096 Jan 26 12:16 docker/

# After execution
root@2c20acb03c37:/_work/github-runner-1/_actions# ll
total 16
drwxr-xr-x 4 root root 4096 Jan 26 13:10 ./
drwxr-xr-x 6 root root 4096 Jan 26 13:10 ../
drwxr-xr-x 4 root root 4096 Jan 26 13:10 actions/
drwxr-xr-x 5 root root 4096 Jan 26 13:10 docker/
```

Although there are actions files in the `_actions` folder, it appears they are deleted and downloaded again, but this process is not shown in the logs. For Set up Job, there is no guidance about caching in the official documentation, and related [issues](https://github.com/actions/runner/issues/2782) remain open.

- actions download: No improvement

#### Run actions/checkout@v4

While the Repository Checkout process initializes the existing branch, it doesn't delete all existing code.

```shell
root@2c20acb03c37:/_work/github-runner-1/test/test# ll
total 212
drwxr-xr-x 9 root root  4096 Jan 26 13:11 ./
drwxr-xr-x 3 root root  4096 Jan 26 10:56 ../
drwxr-xr-x 7 root root  4096 Jan 26 13:11 build/           # <-- Files from this build
-rw-r--r-- 1 root root  3696 Jan 26 10:56 build.gradle.kts # <-- Existing files
...
```

Instead, it uses the `git clean` command to delete files used in previous builds to prevent the new build from being affected by previous build files.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Run actions/checkout@v4</figcaption>
</figure>

For Spring Boot projects, when build files exist, they can be used to reduce build time. If the build process is verified to work without being affected by rebuilds, you can improve performance by changing this option.

https://github.com/actions/checkout

```yaml
# Whether to execute `git clean -ffdx && git reset --hard HEAD` before fetching
# Default: true
clean: ""
```

- Repository Checkout
  - Branch initialization: No improvement
  - Does not completely re-download code: Downloads only changed code if code already exists
  - Removes build files (removes files not managed by git): For Spring Boot Build, build time can be reduced if existing build files are present

#### Setup JDK 17

The execution time changed from `5.67s -> 0s`. Looking at the logs below, there's a message saying `Resolved Java 17.0.14+7.1 from tool-cache`. Since JDK was loaded from the tool-cache, additional installation steps could be skipped.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-3.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Setup JDK 17</figcaption>
</figure>

The tool-cache path can be checked with `${{ runner.tool_cache }}`.

```yaml
- name: Check environment variables
  run: echo "${{ runner.tool_cache }}"
  # Result: echo "/opt/hostedtoolcache"
```

```shell
root@2c20acb03c37:/opt/hostedtoolcache# ll
total 20
drwxr-xr-x 1 runner root 4096 Jan 26 10:59 ./
drwxr-xr-x 1 root   root 4096 Jan 26 01:24 ../
drwxr-xr-x 3 root   root 4096 Jan 26 10:59 docker.io--tonistiigi--binfmt/
drwxr-xr-x 3 root   root 4096 Jan 26 10:56 Java_Corretto_jdk/
```

- JDK download: `/opt/hostedtoolcache`

#### Run build (Gradle)

The Gradle build result shows a significant reduction from `180s -> 33.33s`, saving about 2 minutes and 26 seconds. Let's examine what aspects are being cached.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-4-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Run build (Gradle) Re-Build</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-4-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Run build (Gradle) Clean Build</figcaption>
</figure>

1. gradle download

During the first build, there's a process to download gradle, but from the second build onwards, it proceeds with the build without downloading. Gradle Wrapper (gradlew) automatically manages the Gradle version needed for the build. During this process, the following self-check logic operates. `gradlew` downloads gradle through the URL specified in `./gradle/wrapper/gradle-wrapper.properties` and saves it in `~/.gradle`.

```shell
root@2c20acb03c37:~/.gradle/wrapper/dists# ll
total 16
drwxr-xr-x 3 root root 4096 Jan 26 10:56 ./
drwxr-xr-x 3 root root 4096 Jan 26 10:56 ../
-rw-r--r-- 1 root root  181 Jan 26 10:56 CACHEDIR.TAG
drwxr-xr-x 3 root root 4096 Jan 26 10:56 gradle-8.10.2-bin/
```

However, checking the timestamp shows that the download process only takes about 7 seconds. Where else did the speed difference come from besides gradle download?

2. gradle build

Looking at the gradle build time, it took 2m 29s for the first build and 33s for rebuild, showing a reduction of about 2 minutes. During gradle build, downloading dependencies specified in `build.gradle` takes quite a long time. These dependencies are stored in `~/.gradle/cache/modules`.

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

- gradle download: `~/.gradle/wrapper/dists`
- gradle build caching: `~/.gradle/cache`
  - `--build-cache` option enabled

#### Set up QEMU, Docker Buildx

First, the Set up QEMU execution time remains the same.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-5-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Set up QEMU</figcaption>
</figure>

In Set up QEMU:

1. Download cached `tonistiigi/binfmt` image from Github Actions Cache
2. Save to `tool_cache`, docker cache
3. After loading the image, check if it's the latest version with pull operation
4. Install QEMU static binaries

There is no difference in execution time between initial build and rebuild because it goes through this process.

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

However, since we already have the `tonistiigi/binfmt` image in the host's `tool_cache` and `docker images` list, the GitHub cache process seems unnecessary.

For Set up Docker Buildx, the execution time was reduced from `7s -> 2s`. During the `Booting builder` process, it downloads the `moby/buildkit:buildx-stable-1` image, but the speed difference in pulling occurs because it reuses the previously downloaded image layers.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-setupbuildx-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>setup-buildx-action Re-Build</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-setupbuildx-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>setup-buildx-action Clean Build</figcaption>
</figure>

- docker qemu image download
- qemu binaries installation
- builder instance creation
- builder image download

#### Run build (Docker)

The execution time for Docker build is completely identical. Looking at the logs below, even during Re-Build, it downloads the Base image again, and Layers are not being cached.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-builddocker.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Run build (Docker)</figcaption>
</figure>

Since Docker build operates in a Docker Buildx container, when the build is complete and the Buildx container is removed, the related files cannot be reused.

- Docker Build caching

---

Finally, here's a summary of the areas that can be improved:

- [x] actions download
  - Path: `_work/{runner}/actions`
- [x] Repository Checkout
  - Repository Code fetch doesn't show much difference when cached, and skipped to ensure clean environment for Actions
- [x] JDK download
  - Reuse downloaded JDK in `runner.tool_cache` path
- [x] gradle download
  - Reuse gradle package in `~/.gradle/wrapper/dists`
- [ ] gradle build caching
  - Reuse modules in `~/.gradle/cache/module`
  - build cache
- [ ] docker qemu image download
- [ ] qemu binaries installation
- [ ] builder instance creation
- [ ] builder image download
- [ ] Docker Build caching

## Performance Improvements

Let's improve the build by enhancing the improvable areas identified above.

### gradle build caching

In the previous rebuild process, we confirmed that the following files are cached by default:

- gradle wrapper
- gradle cache module

Here, we can use gradle's build cache feature by utilizing the `--build-cache` option. When this option is enabled, a `build-cache` directory is newly created in the `~/.gradle/cache` path.

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

This build cache is created separately from the build directory, which is the Spring Boot build output.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-buildgradle-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>gradle build caching (Cache Miss)</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-buildgradle-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>gradle build caching (Cache Hit)</figcaption>
</figure>

In the `compileJava` process, the build time was reduced from `36s -> 21s`, saving 15s by utilizing cache twice.

### Re-Build

Let's examine how the process works for the second build, not the initial build.

| Stage                   | Average | Time 1 | Time 2 | Time 3 |
| ----------------------- | ------- | ------ | ------ | ------ |
| Set up job              | 5s      | 6s     | 4s     | 5s     |
| Run actions/checkout@v4 | 1s      | 1s     | 1s     | 1s     |
| Setup JDK 17            | 0s      | 0s     | 0s     | 0s     |
| Run build (Gradle)      | 33.33s  | 34s    | 33s    | 33s    |
| Set up QEMU             | 11s     | 13s    | 11s    | 9s     |
| Set up Docker Buildx    | 3s      | 3s     | 3s     | 3s     |
| Run build (Docker)      | 100s    | 100s   | 100s   | 100s   |

Let's check the time differences between the initial build and rebuild.

| Stage                   | Clean Build | Re-Build | Time Saved |
| ----------------------- | ----------- | -------- | ---------- |
| Set up job              | 4s          | 5s       | + 1s       |
| Run actions/checkout@v4 | 1.67s       | 1s       | - 0.67s    |
| Setup JDK 17            | 5.67s       | 0s       | - 5.67s    |
| Run build (Gradle)      | 180s        | 33.33s   | - 146.67s  |
| Set up QEMU             | 12.67s      | 11s      | - 1.67s    |
| Set up Docker Buildx    | 8s          | 3s       | - 5s       |
| Run build (Docker)      | 100s        | 100s     | 0s         |

Looking at this table, we can see that some steps have reduced execution times without any additional configuration. This is due to reusing the self-hosted runner's resources rather than GitHub Actions cache. Let's make some initial predictions based on the table:

- Set up job shows no significant difference.
- Run actions/checkout@v4 shows no significant difference.
- JDK shows a 6s difference, but with 0s in Re-Build, suggesting complete reuse rather than download or caching.
- Gradle build also appears to be reusing the previous wrapper.
- Set up Qemu and Buildx need closer examination.
- Docker build shows identical execution times. While Docker builds locally use layer caching for multiple builds, it seems caching is not being used in the GitHub Actions environment.

Based on these predictions, let's examine how the rebuild process works.

### docker qemu image download

In `setup-qemu-action`, unlike `setup-buildx-action`, it first tries to load from GitHub Actions cache before reusing the host's image. This process increases execution time by downloading unnecessary cache when we could directly use the image that already exists on the host.

According to the documentation below, `cache-image` is enabled by default, but we can improve speed by disabling this option to reduce unnecessary caching.

https://github.com/docker/setup-qemu-action

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/workflows-rebuild-5-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>setup-qemu-action options</figcaption>
</figure>

We measured the execution time after explicitly setting the `cache-image` option to `false`.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupqemu-1.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupqemu-2.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache removed (using local image)</figcaption>
</figure>

By utilizing the `tonistiigi/binfmt` image already downloaded on the host with the `cache-image=false` option, we can eliminate unnecessary cache download processes. The execution time was reduced from `11s -> 3s`.

### qemu binaries installation

When thinking about caching binaries installation, the thought "Couldn't we just pre-install qemu?" came to mind. If pre-installed, we could skip:

- docker qemu image pull
- install qemu binaries

Even though we reduced execution time by using local images for docker qemu image pull, it still checks for the latest image with a docker pull request, which could cause [Docker pull rate limit](https://docs.docker.com/docker-hub/usage/) issues.

```shell
/usr/bin/docker pull docker.io/tonistiigi/binfmt:latest
/usr/bin/docker run --rm --privileged docker.io/tonistiigi/binfmt:latest --install linux/amd64,linux/arm64
```

Looking at the Set up Qemu logs, it downloads the image and sets up the emulation environment. We pre-configured this process on the self-hosted runner.

```shell
# runner
docker.io/tonistiigi/binfmt:latest --install all
```

Running the build again:

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/ci-cd/github-actions-optimization/cache-setupqemu-3.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>docker qemu image cache removed (using local image)</figcaption>
</figure>

Through this process, we can save `3s` of execution time and one docker pull by skipping the following two tasks:

### Conclusion

| Stage                   | Build  | Build Improved | Time Saved |
| ----------------------- | ------ | -------------- | ---------- |
| Set up job              | 5s     | 5s             | 0s         |
| Run actions/checkout@v4 | 1s     | 1s             | 0s         |
| Setup JDK 17            | 0s     | 0s             | 0s         |
| Run build (Gradle)      | 33.33s | 4s             | -29.33s    |
| Set up QEMU             | 11s    | -              | -11s       |
| Set up Docker Buildx    | 3s     | 3s             | 0s         |
| Run build (Docker)      | 100s   | 118s           | +18s       |

Finally, we reduced the execution time by about `22s` when rebuilding without code changes. While it's disappointing that the Docker build execution time increased slightly due to the added caching process, we should be able to achieve significant time differences once we handle the Base Image issue.

Here's a summary of the build improvements made in this post:

- [x] actions download
  - Path: `_work/{runner}/actions`
- [x] Repository Checkout
  - Repository Code fetch doesn't show much difference when cached, and skipped to ensure clean environment for Actions
- [x] JDK download
  - Reuse downloaded JDK in `runner.tool_cache` path
- [x] gradle download
  - Reuse gradle package in `~/.gradle/wrapper/dists`
- [x] gradle build caching
  - Reuse modules in `~/.gradle/cache/module`
  - Reuse build cache in `~/.gradle/cache/build-cache` (`--build-cache` option enabled)
- [x] docker qemu image download
  - Disable unnecessary cache with `cache-image=false` option
  - Not used due to qemu pre-configuration
- [x] qemu binaries installation
  - qemu pre-configuration
- [x] builder instance creation
  - Create new instance each time to ensure isolated build environment
- [ ] builder image download
  - Change image URL after setting up private Registry
- [x] Docker Build caching
  - Store cache data through local cache for build layers
  - [ ] base image needs to be cached in buildkit container

## Additional: Why didn't we use actions cache?

In this post, we didn't use the cache feature provided by GitHub Actions.

GitHub Actions provides its own [actions cache](https://github.com/actions/cache) feature. This actions can be used for custom caching, and some processes like `Set up QEMU` use cache by default settings.

Generally, using this feature can reduce build time by remotely compressing and reusing dependencies needed for the build. However, the process of uploading/downloading cache files itself takes quite a long time, and it has the disadvantage of externally depending on GitHub Actions infrastructure and network status. Even without network issues, there's also an advantage in terms of speed when controlling cache locally rather than through the network. Additionally, actions cache usage is not unlimited.

Network-related issues were proposed in a [Github Issue](https://github.com/actions/cache/issues/279), but there are no plans for feature development.
