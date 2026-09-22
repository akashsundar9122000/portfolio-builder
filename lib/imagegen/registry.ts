import type { ImageGenerationProvider } from "./types";

/**
 * The single list of providers. The router asks the registry, never an
 * import, so adding a provider is: write the adapter, register it here.
 */
export class ProviderRegistry {
  private providers = new Map<string, ImageGenerationProvider>();

  register(p: ImageGenerationProvider): this {
    if (this.providers.has(p.name)) throw new Error(`Provider "${p.name}" is already registered`);
    this.providers.set(p.name, p);
    return this;
  }

  get(name: string): ImageGenerationProvider | undefined {
    return this.providers.get(name);
  }

  all(): ImageGenerationProvider[] {
    return [...this.providers.values()];
  }

  configured(): ImageGenerationProvider[] {
    return this.all().filter((p) => p.isConfigured());
  }
}
