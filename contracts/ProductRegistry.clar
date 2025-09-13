(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PRODUCT-ID u101)
(define-constant ERR-INVALID-NAME u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-INVALID-CERT-HASH u104)
(define-constant ERR-PRODUCT-EXISTS u105)
(define-constant ERR-PRODUCT-NOT-FOUND u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-INVALID-STATUS u108)
(define-constant ERR-INVALID-PRODUCER u109)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u110)
(define-constant ERR-INVALID-CATEGORY u111)
(define-constant ERR-INVALID-ORIGIN u112)
(define-constant ERR-INVALID-BATCH-NO u113)
(define-constant ERR-INVALID-WEIGHT u114)
(define-constant ERR-INVALID-MAX-PRODUCTS u115)

(define-data-var next-product-id uint u0)
(define-data-var max-products uint u10000)
(define-data-var authority-contract (optional principal) none)

(define-map products
  { product-id: (string-ascii 64) }
  { name: (string-ascii 128), description: (string-utf8 256), producer: principal, cert-hash: (string-ascii 64), created-at: uint, status: bool, category: (string-ascii 50), origin: (string-ascii 100), batch-no: (string-ascii 50), weight: uint })

(define-map products-by-name
  { name: (string-ascii 128) }
  { product-id: (string-ascii 64) })

(define-map product-updates
  { product-id: (string-ascii 64) }
  { update-name: (string-ascii 128), update-description: (string-utf8 256), update-timestamp: uint, updater: principal })

(define-read-only (get-product (product-id (string-ascii 64)))
  (map-get? products { product-id: product-id }))

(define-read-only (get-product-updates (product-id (string-ascii 64)))
  (map-get? product-updates { product-id: product-id }))

(define-read-only (is-product-registered (name (string-ascii 128)))
  (is-some (map-get? products-by-name { name: name })))

(define-private (validate-product-id (product-id (string-ascii 64)))
  (if (and (> (len product-id) u0) (<= (len product-id) u64))
      (ok true)
      (err ERR-INVALID-PRODUCT-ID)))

(define-private (validate-name (name (string-ascii 128)))
  (if (and (> (len name) u0) (<= (len name) u128))
      (ok true)
      (err ERR-INVALID-NAME)))

(define-private (validate-description (description (string-utf8 256)))
  (if (<= (len description) u256)
      (ok true)
      (err ERR-INVALID-DESCRIPTION)))

(define-private (validate-cert-hash (cert-hash (string-ascii 64)))
  (if (and (> (len cert-hash) u0) (<= (len cert-hash) u64))
      (ok true)
      (err ERR-INVALID-CERT-HASH)))

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP)))

(define-private (validate-producer (producer principal))
  (if (not (is-eq producer 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PRODUCER)))

(define-private (validate-category (category (string-ascii 50)))
  (if (and (> (len category) u0) (<= (len category) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY)))

(define-private (validate-origin (origin (string-ascii 100)))
  (if (and (> (len origin) u0) (<= (len origin) u100))
      (ok true)
      (err ERR-INVALID-ORIGIN)))

(define-private (validate-batch-no (batch-no (string-ascii 50)))
  (if (and (> (len batch-no) u0) (<= (len batch-no) u50))
      (ok true)
      (err ERR-INVALID-BATCH-NO)))

(define-private (validate-weight (weight uint))
  (if (> weight u0)
      (ok true)
      (err ERR-INVALID-WEIGHT)))

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-producer contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)))

(define-public (set-max-products (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-MAX-PRODUCTS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-products new-max)
    (ok true)))

(define-public (register-product
  (product-id (string-ascii 64))
  (name (string-ascii 128))
  (description (string-utf8 256))
  (cert-hash (string-ascii 64))
  (category (string-ascii 50))
  (origin (string-ascii 100))
  (batch-no (string-ascii 50))
  (weight uint))
  (let ((next-id (var-get next-product-id))
        (max-products-count (var-get max-products))
        (authority (var-get authority-contract)))
    (asserts! (< next-id max-products-count) (err ERR-INVALID-MAX-PRODUCTS))
    (try! (validate-product-id product-id))
    (try! (validate-name name))
    (try! (validate-description description))
    (try! (validate-cert-hash cert-hash))
    (try! (validate-producer tx-sender))
    (try! (validate-category category))
    (try! (validate-origin origin))
    (try! (validate-batch-no batch-no))
    (try! (validate-weight weight))
    (asserts! (is-none (map-get? products { product-id: product-id })) (err ERR-PRODUCT-EXISTS))
    (asserts! (is-none (map-get? products-by-name { name: name })) (err ERR-PRODUCT-EXISTS))
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (map-set products { product-id: product-id }
      { name: name, description: description, producer: tx-sender, cert-hash: cert-hash, created-at: block-height, status: true, category: category, origin: origin, batch-no: batch-no, weight: weight })
    (map-set products-by-name { name: name } { product-id: product-id })
    (var-set next-product-id (+ next-id u1))
    (print { event: "product-registered", id: product-id })
    (ok product-id)))

(define-public (update-product
  (product-id (string-ascii 64))
  (new-name (string-ascii 128))
  (new-description (string-utf8 256)))
  (let ((product (map-get? products { product-id: product-id })))
    (match product
      p
      (begin
        (asserts! (is-eq (get producer p) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-name new-name))
        (try! (validate-description new-description))
        (let ((existing (map-get? products-by-name { name: new-name })))
          (match existing
            existing-id
            (asserts! (is-eq (get product-id existing-id) product-id) (err ERR-PRODUCT-EXISTS))
            (begin true)))
        (let ((old-name (get name p)))
          (if (is-eq old-name new-name)
              (ok true)
              (begin
                (map-delete products-by-name { name: old-name })
                (map-set products-by-name { name: new-name } { product-id: product-id })
                (ok true))))
        (map-set products { product-id: product-id }
          { name: new-name, description: new-description, producer: (get producer p), cert-hash: (get cert-hash p), created-at: (get created-at p), status: (get status p), category: (get category p), origin: (get origin p), batch-no: (get batch-no p), weight: (get weight p) })
        (map-set product-updates { product-id: product-id }
          { update-name: new-name, update-description: new-description, update-timestamp: block-height, updater: tx-sender })
        (print { event: "product-updated", id: product-id })
        (ok true))
      (err ERR-PRODUCT-NOT-FOUND))))