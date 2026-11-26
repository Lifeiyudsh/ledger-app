# 构建失败（2026-11-26T03:09:52Z）

commit: c95d0b53a2af0e979a0746637f445fd1d0e96adf

```
342:Caused by: org.gradle.api.internal.artifacts.ivyservice.TypedResolveException: Could not resolve all dependencies for configuration ':notification-listener:releaseRuntimeClasspath'.
353:Caused by: org.gradle.internal.resolve.ModuleVersionResolveException: Could not resolve org.jetbrains.kotlinx:kotlinx-coroutines-android:1.6.4.
356:Caused by: org.gradle.internal.resolve.ModuleVersionResolveException: Repository MavenRepo is disabled due to earlier error below:
357:Caused by: org.gradle.internal.resolve.ArtifactResolveException: Could not download org.jetbrains.kotlin.jvm.gradle.plugin-2.2.0.jar (org.jetbrains.kotlin.jvm:org.jetbrains.kotlin.jvm.gradle.plugin:2.2.0)
647:Caused by: org.gradle.api.resources.ResourceException: Could not get resource 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/jvm/org.jetbrains.kotlin.jvm.gradle.plugin/2.2.0/org.jetbrains.kotlin.jvm.gradle.plugin-2.2.0.jar'.
657:Caused by: org.gradle.internal.resource.transport.http.HttpErrorStatusCodeException: Could not HEAD 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/jvm/org.jetbrains.kotlin.jvm.gradle.plugin/2.2.0/org.jetbrains.kotlin.jvm.gradle.plugin-2.2.0.jar'. Received status code 429 from server: Too Many Requests

--- 最后 40 行 ---
	at org.gradle.internal.concurrent.ExecutorPolicy$CatchAndRecordFailures.onExecute(ExecutorPolicy.java:64)
	at org.gradle.internal.concurrent.AbstractManagedExecutor$1.run(AbstractManagedExecutor.java:47)
Caused by: org.gradle.api.resources.ResourceException: Could not get resource 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/jvm/org.jetbrains.kotlin.jvm.gradle.plugin/2.2.0/org.jetbrains.kotlin.jvm.gradle.plugin-2.2.0.jar'.
	at org.gradle.internal.resource.ResourceExceptions.failure(ResourceExceptions.java:74)
	at org.gradle.internal.resource.ResourceExceptions.getFailed(ResourceExceptions.java:57)
	at org.gradle.api.internal.artifacts.repositories.resolver.DefaultExternalResourceArtifactResolver.staticResourceExists(DefaultExternalResourceArtifactResolver.java:83)
	at org.gradle.api.internal.artifacts.repositories.resolver.DefaultExternalResourceArtifactResolver.artifactExists(DefaultExternalResourceArtifactResolver.java:67)
	at org.gradle.api.internal.artifacts.repositories.resolver.ExternalResourceResolver$RemoteRepositoryAccess.resolveArtifact(ExternalResourceResolver.java:472)
	at org.gradle.api.internal.artifacts.ivyservice.ivyresolve.CachingModuleComponentRepository$ResolveAndCacheRepositoryAccess.resolveArtifact(CachingModuleComponentRepository.java:470)
	at org.gradle.api.internal.artifacts.ivyservice.ivyresolve.ErrorHandlingModuleComponentRepository$ErrorHandlingModuleComponentRepositoryAccess.lambda$resolveArtifact$12(ErrorHandlingModuleComponentRepository.java:180)
	at org.gradle.api.internal.artifacts.ivyservice.ivyresolve.ErrorHandlingModuleComponentRepository$ErrorHandlingModuleComponentRepositoryAccess.tryResolveAndMaybeDisable(ErrorHandlingModuleComponentRepository.java:251)
	... 287 more
Caused by: org.gradle.internal.resource.transport.http.HttpErrorStatusCodeException: Could not HEAD 'https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/jvm/org.jetbrains.kotlin.jvm.gradle.plugin/2.2.0/org.jetbrains.kotlin.jvm.gradle.plugin-2.2.0.jar'. Received status code 429 from server: Too Many Requests
	at org.gradle.internal.resource.transport.http.ApacheCommonsHttpClient.processResponse(ApacheCommonsHttpClient.java:310)
	at org.gradle.internal.resource.transport.http.ApacheCommonsHttpClient.performHead(ApacheCommonsHttpClient.java:114)
	at org.gradle.internal.resource.transport.http.HttpResourceAccessor.getMetaData(HttpResourceAccessor.java:58)
	at org.gradle.internal.resource.transfer.DefaultExternalResourceConnector.getMetaData(DefaultExternalResourceConnector.java:66)
	at org.gradle.internal.resource.transfer.ProgressLoggingExternalResourceAccessor$MetadataOperation.call(ProgressLoggingExternalResourceAccessor.java:173)
	at org.gradle.internal.resource.transfer.ProgressLoggingExternalResourceAccessor$MetadataOperation.call(ProgressLoggingExternalResourceAccessor.java:161)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:210)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:205)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.call(DefaultBuildOperationRunner.java:54)
	at org.gradle.internal.resource.transfer.ProgressLoggingExternalResourceAccessor.getMetaData(ProgressLoggingExternalResourceAccessor.java:55)
	at org.gradle.internal.resource.transfer.AccessorBackedExternalResource.getMetaData(AccessorBackedExternalResource.java:156)
	at org.gradle.api.internal.artifacts.repositories.resolver.DefaultExternalResourceArtifactResolver.staticResourceExists(DefaultExternalResourceArtifactResolver.java:79)
	... 292 more


Deprecated Gradle features were used in this build, making it incompatible with Gradle 10.

You can use '--warning-mode all' to show the individual deprecation warnings and determine if they come from your own scripts or plugins.

For more on this, please refer to https://docs.gradle.org/9.4.1/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.

BUILD FAILED in 1m 5s
32 actionable tasks: 32 executed
```
