/* Injector.js
 */
 
export class Injector {
  static getDependencies() {
    // This won't be called, I'm just setting a good example.
    return [Window];
  }
  constructor(window) {
    this.window = window;
    
    this._singletons = {
      Window: this.window,
      Document: this.window.document,
      Injector: this,
    };
    this._instantiationInProgress = [];
    this._nextDiscriminator = 1;
  }
  
  getInstance(clazz, overrides) {
  
    if (clazz === "discriminator") {
      return this._nextDiscriminator++;
    }
  
    if (overrides) {
      for (const override of overrides) {
        if ((override.constructor === clazz) || clazz.isPrototypeOf(override.constructor)) return override;
      }
    }
  
    const name = clazz.name;
    const singleton = this._singletons[name];
    if (singleton) return singleton;
    
    if (this._instantiationInProgress.indexOf(name) >= 0) {
      throw new Error(`Dependency loop involving these classes: ${JSON.stringify(this._instantiationInProgress)}`);
    }
    this._instantiationInProgress.push(name);
    
    const dependencyClasses = clazz.getDependencies?.() || [];
    const dependencies = [];
    for (const dependencyClass of dependencyClasses) {
      dependencies.push(this.getInstance(dependencyClass, overrides));
    }
    const instance = new clazz(...dependencies);
    
    const p = this._instantiationInProgress.indexOf(name);
    if (p >= 0) this._instantiationInProgress.splice(p, 1);
    
    if (clazz.singleton) {
      this._singletons[name] = instance;
    }
    
    return instance;
  }
}

Injector.singleton = true;
