---
title: Using Annotation Processors
type: blog
date: 2024-12-22
tags:
  - spring
  - java
summary: "This blog post explores using Java’s Annotation Processor to enforce specific naming conventions for Enums at compile time, enhancing code consistency and reducing errors. It covers the setup, implementation, and troubleshooting steps necessary for integrating Annotation Processors into Java projects, emphasizing solutions for common build challenges."
weight: 1
---

Today, we'll look at how to utilize Java's Annotation Processor functionality. By adding annotations, you can add specific functionality at desired points. A notable example is `lombok`, which helps create `getters`, `setters`, and more using this feature.

During work, I encountered the following situation:

> How can we ensure other developers follow naming conventions when creating certain Enum classes?

Even beyond this specific issue, there are times when we need compile-time rule checking or automatic code generation like lombok. Let's solve this using Annotation Processors.

## Checking Enum Name Patterns

First, we'll implement Enum Name Pattern checking to ensure developers don't miss the conventions. Since this is a development environment feature, it shouldn't be included in production code. Therefore, we need to satisfy these requirements:

1. Notify at compile time
2. Remove from production code

## Example Code

In this post, I'll focus on introducing the setup methods for using Annotation Processors rather than detailed logic implementation. You can find the complete code on GitHub[^1].

### EnumNamePattern.class

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.CLASS)
public @interface EnumNamePattern {
    String value();
}
```

### EnumNamePatternProcessor.class

```java
public class EnumNamePatternProcessor extends AbstractProcessor {
    @Override
    public SourceVersion getSupportedSourceVersion() {
        return SourceVersion.latestSupported();
    }

    @Override
    public Set<String> getSupportedAnnotationTypes() {
        return Set.of(EnumNamePattern.class.getCanonicalName());
    }

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
      // ..
      // In my case, I implemented checks for all uppercase names and EnumNamePattern.value regex
      return true;
    }
}
```

{{% details title="Complete EnumNamePatternProcessor Code" closed="true" %}}

```java
package com.moseoh.annotationprocessor;

import java.util.Set;
import java.util.regex.Pattern;
import javax.annotation.processing.AbstractProcessor;
import javax.annotation.processing.RoundEnvironment;
import javax.lang.model.SourceVersion;
import javax.lang.model.element.Element;
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.TypeElement;
import javax.tools.Diagnostic;

public class EnumNamePatternProcessor extends AbstractProcessor {

    @Override
    public SourceVersion getSupportedSourceVersion() {
        return SourceVersion.latestSupported();
    }

    @Override
    public Set<String> getSupportedAnnotationTypes() {
        return Set.of(EnumNamePattern.class.getCanonicalName());
    }

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
        for (Element element : roundEnv.getElementsAnnotatedWith(EnumNamePattern.class)) {
            processingEnv.getMessager().printMessage(Diagnostic.Kind.NOTE, "Processing: " + element.getSimpleName());

            // 1. Check if Element is enum
            if (element.getKind() != ElementKind.ENUM) {
                processingEnv.getMessager().printMessage(
                        Diagnostic.Kind.ERROR,
                        "@EnumNameRegex can only be applied to enum types",
                        element
                );
                continue;
            }

            // 2. Get annotation value
            EnumNamePattern annotation = element.getAnnotation(EnumNamePattern.class);
            String regex = annotation.value();

            // 3. Validate enum constants
            for (Element enclosed : element.getEnclosedElements()) {
                if (enclosed.getKind() == ElementKind.ENUM_CONSTANT) {
                    String enumName = enclosed.getSimpleName().toString();

                    // 3.1 Check uppercase
                    if (!enumName.equals(enumName.toUpperCase())) {
                        processingEnv.getMessager().printMessage(
                                Diagnostic.Kind.ERROR,
                                "Enum value '" + enumName + "' must be uppercase",
                                enclosed
                        );
                    }

                    // 3.2 Check regex
                    if (!Pattern.matches(regex, enumName)) {
                        processingEnv.getMessager().printMessage(
                                Diagnostic.Kind.ERROR,
                                "Enum value '" + enumName + "' doesn't match the specified pattern: " + regex,
                                enclosed
                        );
                    }
                }
            }
        }
        return true;
    }
}
```

{{% /details %}}

### build.gradle.kts

```kotlin
// ..
dependencies {
    // ..
    annotationProcessor(files("${layout.buildDirectory.get()}/libs/annotationprocessor-0.0.1-SNAPSHOT-plain.jar")) // your jar file name
}
// ..
```

{{% details title="Complete build.gradle.kts Code" closed="true" %}}

```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.moseoh"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.postgresql:postgresql")
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    annotationProcessor(files("${layout.buildDirectory.get()}/libs/annotationprocessor-0.0.1-SNAPSHOT-plain.jar"))
}

tasks.withType<Test> {
    useJUnitPlatform()
}
```

{{% /details %}}

### javax.annotation.processing.Processor

To recognize and execute the Annotation Processor using Java's Service Provider Interface (SPI), you need to create this file:

1. When the compiler javac runs, it searches for META-INF/services/javax.annotation.processing.Processor in the classpath
2. Processor Loading: Loads the Annotation Processor implementation class based on file contents
3. Processor Execution: Calls the process method of the Annotation Processor to process annotations

{{< filetree/container >}}
{{< filetree/folder name="src" state="open">}}
{{< filetree/folder name="main" state="open">}}
{{< filetree/folder name="resources" state="open">}}
{{< filetree/folder name="META-INF" state="open">}}
{{< filetree/folder name="services" state="open">}}
{{< filetree/file name="javax.annotation.processing.Processor" >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/container >}}

```text
// javax.annotation.processing.Processor file content
com.moseoh.annotationprocessor.EnumNamePatternProcessor
```

To avoid missing META-INF file creation or for better file management, there's a library[^2] that automatically generates the `javax.annotation.processing.Processor` file, eliminating the need to create it manually in META-INF.

### build.gradle.kts

```kotlin
dependencies {
    // ..
    implementation("com.google.auto.service:auto-service:1.1.1")
    annotationProcessor("com.google.auto.service:auto-service:1.1.1")
    // ..
}
```

### EnumNamePatternProcessor

```java
// ..
import javax.annotation.processing.Processor;
// ..
import com.google.auto.service.AutoService;
// ..

@AutoService(Processor.class)
public class EnumNamePatternProcessor extends AbstractProcessor {
    // ..
}
```

During build, you can verify that the same file and content are added to `build/classes/java/main/META-INF/services`.

## Results

We've applied the annotation and Processor implementation and written the SPI. Now we can detect whether enum names match the pattern at compile time.

### UserType enum class

```java
@EnumNamePattern(value = "^.*_(ADMIN|MANAGER)$")
public enum UserType {
    TEST_ADMIN,
    TEST_MANAGER,

    TEST_FAILED,
    TEST_failed,
}
```

```shell
./gradlew clean
./gradlew build
./gradlew build # Not a mistake! You need to run build twice after clean
```

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/spring/annotation-processor/enum-name-pattern-result.png" align="center" width="800" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Compile errors occur for Enum name pattern violations</figcaption>
</figure>

## Why Do We Need to Build Twice?

The build typically goes through these stages:

1. Source File Compilation\
   javac compiles source files while loading and executing Annotation Processors.
2. Annotation Processor Execution\
   Based on compiled class files, Annotation Processors run to generate additional code or perform validation.
3. Generated Code Compilation\
   Files generated by the Processor are compiled in the next build phase.

When the Processor is implemented within the same project, it's not yet compiled during the first build. Therefore, javac can't load the Processor and only performs compilation, skipping annotation processing. From the second build, the Processor can be loaded, enabling annotation processing.

### How Can We Solve This?

1. Multi-Module Configuration

Separate the Annotation Processor into a distinct module and inject it as a dependency into the application.
This way, the Processor module can be explicitly built before the application, allowing the Processor to function normally.

2. Library Distribution

The Annotation Processor code can be pre-compiled and provided as a JAR file.
Adding this as a project dependency resolves the build order issue.

### What Solution Did We Choose?

In our project, we decided not to solve this issue immediately.
Introducing multi-module configuration could complicate the codebase and confuse less experienced developers.

While we wanted to provide it as a library, we don't yet have a Maven Repository or deployment system in place to manage it.
Since we plan to introduce an internal Maven Repository soon, we're currently working around the issue by explicitly running `build` after `compileJava` in CI.

## Multi-Module Configuration[^3]

### 1. Create Module

First, create a new module.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/spring/annotation-processor/new-module-1.png" align="center" width="600" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>file > new > module</figcaption>
</figure>

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/spring/annotation-processor/new-module-2.png" align="center" width="600" style="border: 1px solid #555; border-radius: 7px;"/>
</figure>

When creating a module in IntelliJ, it's automatically added to gradle settings. If using another editor or adding manually, add the module to `settings.gradle.kts`:

```kotlin
// settings.gradle.kts
rootProject.name = "annotationprocessor"
include("processor") // <-- here
```

### 2. Move Files

Move the code required for Annotation Processor operation to the module. In this post, we have the `EnumNamePattern` annotation class and `EnumNamePatternProcessor` class.

{{% details title="File Structure" closed="true" %}}

{{< filetree/container >}}
{{< filetree/folder name="processor" state="open">}}
{{< filetree/folder name="src" state="open">}}
{{< filetree/folder name="main" state="open">}}
{{< filetree/folder name="java" state="open">}}
{{< filetree/folder name="com" state="open">}}
{{< filetree/folder name="moseoh" state="open">}}
{{< filetree/folder name="processor" state="open">}}
{{< filetree/file name="EnumNamePattern" >}}
{{< filetree/file name="EnumNamePatternProcessor" >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< filetree/folder name="src" state="open">}}
{{< filetree/folder name="main" state="open">}}
{{< filetree/folder name="java" state="open">}}
{{< filetree/folder name="com" state="open">}}
{{< filetree/folder name="moseoh" state="open">}}
{{< filetree/folder name="annotationprocessor" state="open">}}
{{< filetree/file name="AnnotationProcessorApplication" >}}
{{< filetree/file name="UserType" >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/folder >}}
{{< /filetree/container >}}

{{% /details %}}

Also move the dependencies added for the annotation processor:

```kotlin
dependencies {
    //..
    // Add to process module build.gradle.kts && Remove from root project build.gradle.kts
    implementation("com.google.auto.service:auto-service:1.1.1")
    annotationProcessor("com.google.auto.service:auto-service:1.1.1")
    //..
}
```

### 3. Import Module

Add the `processor` module to the root project's `build.gradle.kts`.

#### `annotationProcessor`

The processor module contains only code needed to run the annotation processor.
Therefore, we activate this functionality through annotationProcessor.
While annotation processing works correctly with just annotationProcessor,
you'll get errors when trying to reference annotation classes (e.g., @EnumNamePattern) from the processor module in root project code.
To resolve this, we need to declare an additional compileOnly dependency.

#### `compileOnly`

compileOnly allows the root project to reference annotation classes from the processor module.
Annotation processors only operate at compile time and are unnecessary at runtime.
Therefore, we use compileOnly to exclude related dependencies from the build artifacts.

```kotlin
dependencies {
    //..
    compileOnly(project(":processor"))
    annotationProcessor(project(":processor"))
    //..
}
```

Now we can catch errors at compile time through the annotation processor without running the build twice.

<figure style="display: inline-block; width: 100%">
  <img src="/images/blog/spring/annotation-processor/new-module-result.png" align="center" width="100%" style="border: 1px solid #555; border-radius: 7px;"/>
  <figcaption>Compile errors occur for Enum name pattern violations</figcaption>
</figure>

Additionally, let's verify that the root project's build file excludes the processor module:

```shell
# While grep shows annotationprocessor (root project name), there's no module code

> jar tf build/libs/annotationprocessor-0.0.1-SNAPSHOT.jar | grep processor
BOOT-INF/classes/com/moseoh/annotationprocessor/
BOOT-INF/classes/com/moseoh/annotationprocessor/UserType.class
BOOT-INF/classes/com/moseoh/annotationprocessor/AnnotationprocessorApplication.class
```

Let's quickly check what happens when declared as `implementation`:

```kotlin
dependencies {
    //..
    implementation(project(":processor"))
    annotationProcessor(project(":processor"))
    //..
}
```

```shell
> ./gradlew clean build
> jar tf build/libs/annotationprocessor-0.0.1-SNAPSHOT.jar | grep processor
BOOT-INF/classes/com/moseoh/annotationprocessor/
BOOT-INF/classes/com/moseoh/annotationprocessor/UserType.class
BOOT-INF/classes/com/moseoh/annotationprocessor/AnnotationprocessorApplication.class
BOOT-INF/lib/processor-0.0.1-SNAPSHOT.jar # <-- processor module
```

## Library Distribution

<!-- annotation-processor github -->

[^1]: https://github.com/moseoh/blog-code-example/tree/master/spring/annotationprocessor/enumnamepattern
[^2]: https://github.com/google/auto/tree/main/service
[^3]: https://github.com/moseoh/blog-code-example/tree/master/spring/annotationprocessor/enumnamepattern-multi-module
