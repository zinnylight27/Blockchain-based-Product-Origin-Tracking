import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PRODUCT_ID = 101;
const ERR_INVALID_NAME = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_CERT_HASH = 104;
const ERR_PRODUCT_EXISTS = 105;
const ERR_PRODUCT_NOT_FOUND = 106;
const ERR_AUTHORITY_NOT_VERIFIED = 110;
const ERR_INVALID_CATEGORY = 111;
const ERR_INVALID_ORIGIN = 112;
const ERR_INVALID_BATCH_NO = 113;
const ERR_INVALID_WEIGHT = 114;
const ERR_INVALID_MAX_PRODUCTS = 115;

interface Product {
  name: string;
  description: string;
  producer: string;
  certHash: string;
  createdAt: number;
  status: boolean;
  category: string;
  origin: string;
  batchNo: string;
  weight: number;
}

interface ProductUpdate {
  updateName: string;
  updateDescription: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ProductRegistryMock {
  state: {
    nextProductId: number;
    maxProducts: number;
    authorityContract: string | null;
    products: Map<string, Product>;
    productsByName: Map<string, { productId: string }>;
    productUpdates: Map<string, ProductUpdate>;
  } = {
    nextProductId: 0,
    maxProducts: 10000,
    authorityContract: null,
    products: new Map(),
    productsByName: new Map(),
    productUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);

  reset() {
    this.state = {
      nextProductId: 0,
      maxProducts: 10000,
      authorityContract: null,
      products: new Map(),
      productsByName: new Map(),
      productUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxProducts(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxProducts = newMax;
    return { ok: true, value: true };
  }

  registerProduct(
    productId: string,
    name: string,
    description: string,
    certHash: string,
    category: string,
    origin: string,
    batchNo: string,
    weight: number
  ): Result<string> {
    if (this.state.nextProductId >= this.state.maxProducts) return { ok: false, value: ERR_INVALID_MAX_PRODUCTS };
    if (!productId || productId.length > 64) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (!name || name.length > 128) return { ok: false, value: ERR_INVALID_NAME };
    if (description.length > 256) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!certHash || certHash.length > 64) return { ok: false, value: ERR_INVALID_CERT_HASH };
    if (!category || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (!origin || origin.length > 100) return { ok: false, value: ERR_INVALID_ORIGIN };
    if (!batchNo || batchNo.length > 50) return { ok: false, value: ERR_INVALID_BATCH_NO };
    if (weight <= 0) return { ok: false, value: ERR_INVALID_WEIGHT };
    if (!this.authorities.has(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.products.has(productId)) return { ok: false, value: ERR_PRODUCT_EXISTS };
    if (this.state.productsByName.has(name)) return { ok: false, value: ERR_PRODUCT_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    const product: Product = {
      name,
      description,
      producer: this.caller,
      certHash,
      createdAt: this.blockHeight,
      status: true,
      category,
      origin,
      batchNo,
      weight,
    };
    this.state.products.set(productId, product);
    this.state.productsByName.set(name, { productId });
    this.state.nextProductId++;
    return { ok: true, value: productId };
  }

  updateProduct(productId: string, newName: string, newDescription: string): Result<boolean> {
    const product = this.state.products.get(productId);
    if (!product) return { ok: false, value: false };
    if (product.producer !== this.caller) return { ok: false, value: false };
    if (!newName || newName.length > 128) return { ok: false, value: false };
    if (newDescription.length > 256) return { ok: false, value: false };
    if (this.state.productsByName.has(newName) && this.state.productsByName.get(newName)!.productId !== productId) {
      return { ok: false, value: false };
    }

    const updated: Product = { ...product, name: newName, description: newDescription, createdAt: this.blockHeight };
    this.state.products.set(productId, updated);
    this.state.productsByName.delete(product.name);
    this.state.productsByName.set(newName, { productId });
    this.state.productUpdates.set(productId, {
      updateName: newName,
      updateDescription: newDescription,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getProduct(productId: string): Product | null {
    return this.state.products.get(productId) || null;
  }

  getProductUpdates(productId: string): ProductUpdate | null {
    return this.state.productUpdates.get(productId) || null;
  }

  isProductRegistered(name: string): Result<boolean> {
    return { ok: true, value: this.state.productsByName.has(name) };
  }
}

describe("ProductRegistry", () => {
  let contract: ProductRegistryMock;

  beforeEach(() => {
    contract = new ProductRegistryMock();
    contract.reset();
  });

  it("registers a product successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe("PROD1");

    const product = contract.getProduct("PROD1");
    expect(product?.name).toBe("Organic Coffee");
    expect(product?.description).toBe("Premium Arabica beans");
    expect(product?.producer).toBe("ST1TEST");
    expect(product?.certHash).toBe("CERT123");
    expect(product?.category).toBe("Beverage");
    expect(product?.origin).toBe("Colombia");
    expect(product?.batchNo).toBe("BATCH001");
    expect(product?.weight).toBe(1000);
  });

  it("rejects duplicate product IDs", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    const result = contract.registerProduct(
      "PROD1",
      "Decaf Coffee",
      "Decaffeinated beans",
      "CERT456",
      "Beverage",
      "Brazil",
      "BATCH002",
      500
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PRODUCT_EXISTS);
  });

  it("rejects duplicate product names", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    const result = contract.registerProduct(
      "PROD2",
      "Organic Coffee",
      "Different beans",
      "CERT456",
      "Beverage",
      "Brazil",
      "BATCH002",
      500
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PRODUCT_EXISTS);
  });

  it("rejects non-authorized caller", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2FAKE";
    contract.authorities = new Set();
    const result = contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects registration without authority contract", () => {
    const result = contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid product ID", () => {
    contract.setAuthorityContract("ST2TEST");
    const longId = "A".repeat(65);
    const result = contract.registerProduct(
      longId,
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRODUCT_ID);
  });

  it("rejects invalid name", () => {
    contract.setAuthorityContract("ST2TEST");
    const longName = "A".repeat(129);
    const result = contract.registerProduct(
      "PROD1",
      longName,
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NAME);
  });

  it("updates a product successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    const result = contract.updateProduct("PROD1", "Decaf Coffee", "Decaffeinated beans");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const product = contract.getProduct("PROD1");
    expect(product?.name).toBe("Decaf Coffee");
    expect(product?.description).toBe("Decaffeinated beans");
    const update = contract.getProductUpdates("PROD1");
    expect(update?.updateName).toBe("Decaf Coffee");
    expect(update?.updateDescription).toBe("Decaffeinated beans");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent product", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateProduct("PROD99", "Decaf Coffee", "Decaffeinated beans");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-producer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateProduct("PROD1", "Decaf Coffee", "Decaffeinated beans");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets max products successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMaxProducts(5000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxProducts).toBe(5000);
  });

  it("rejects max products change without authority", () => {
    const result = contract.setMaxProducts(5000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("checks product existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "PROD1",
      "Organic Coffee",
      "Premium Arabica beans",
      "CERT123",
      "Beverage",
      "Colombia",
      "BATCH001",
      1000
    );
    const result = contract.isProductRegistered("Organic Coffee");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.isProductRegistered("NonExistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses product parameters with Clarity types", () => {
    const productId = stringAsciiCV("PROD1");
    const name = stringAsciiCV("Organic Coffee");
    const description = stringUtf8CV("Premium Arabica beans");
    const weight = uintCV(1000);
    expect(productId.value).toBe("PROD1");
    expect(name.value).toBe("Organic Coffee");
    expect(description.value).toBe("Premium Arabica beans");
    expect(weight.value).toEqual(BigInt(1000));
  });
});