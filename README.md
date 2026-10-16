# Gestionale-supermercato

Gestione Supermercato è un'applicazione desktop Windows realizzata con Electron. Gestisce catalogo, cassa, scontrini, promozioni, statistiche e archivio locale.

## Avvio in sviluppo

Richiede Node.js 22 o successivo.

```sh
npm ci
npm run dev
```

Per creare manualmente l'installer Windows:

```sh
npm run dist:win
```

Il file `Gestione-Supermercato-Setup-<versione>.exe` viene generato nella cartella `release`.

## Dati e dispositivi

Il database SQLite viene salvato nella cartella dati utente di Windows e conserva prodotti, date di scadenza attivate, movimenti di magazzino, vendite, scontrini, promozioni e impostazioni. La sezione Magazzino include le pagine per il catalogo, lo storico dei carichi e scarichi e la registrazione di nuovi movimenti. Al primo avvio aggiornato, le vendite già archiviate vengono importate nello storico senza alterare le giacenze. La sezione Impostazioni > Archivio dati permette di scegliere dove salvare i report giornalieri in PDF, suddivisi in cartelle per Magazzino, Cassa, Vendite, Promozioni e Statistiche. I vecchi file TXT con nome data nelle cartelle di backup vengono rimossi quando il backup giornaliero viene aggiornato. Dopo aver configurato la cartella, per modificarla è richiesta una conferma aggiuntiva. Il backup viene eseguito a mezzanotte; se il gestionale è chiuso, recupera i giorni mancanti al successivo avvio.

La sezione Dipendenti permette di registrare dati anagrafici e contrattuali, foto del dipendente e dei documenti e il contratto PDF. La password iniziale viene salvata come hash nel database locale; la lista è ricercabile ed esportabile in PDF. I buoni sconto generati includono il barcode corrispondente al codice univoco.

La sezione **Impostazioni > Dispositivi** permette di attivare il lettore barcode USB (i modelli che inviano i codici come tastiera sono riconosciuti alla prima lettura) e di collegare una stampante installata per la stampa diretta degli scontrini. La selezione della stampante e le preferenze del lettore restano salvate. La scansione di articoli sconosciuti in cassa chiede conferma prima di aprire il nuovo articolo; il codice acquisito viene inserito nel modulo ed è modificabile. Nelle pagine Vendite e Modifica o Elimina è possibile usare il lettore per cercare un numero di scontrino. La scansione tramite fotocamera è disponibile in Cassa, Vendite e Modifica o Elimina, se il dispositivo e i permessi la supportano. Gli articoli configurati a chilogrammi o litri richiedono l'inserimento del peso o del volume alla cassa e il relativo prezzo viene calcolato in base al prezzo unitario.

In sviluppo viene caricato un catalogo dimostrativo; l'installer parte con il magazzino vuoto.

## Release automatiche

Il workflow `.github/workflows/release.yml` crea un installer Windows e una GitHub Release per ogni push su qualsiasi branch. La versione viene incrementata usando il numero progressivo della run (`0.1.<run>`). Lo stesso workflow può essere avviato manualmente dalla scheda Actions.

Nel repository GitHub, abilita i permessi di scrittura per `GITHUB_TOKEN` in **Settings > Actions > General > Workflow permissions**. L'installer scaricabile si trova negli asset della release più recente.