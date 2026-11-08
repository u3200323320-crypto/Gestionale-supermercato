# Gestionale-supermercato

Gestione Supermercato è un'applicazione desktop Windows realizzata con Electron. Gestisce catalogo, cassa, scontrini, promozioni, statistiche e archivio locale.

## Avvio in sviluppo

Richiede Node.js 22 o successivo.

```sh
npm ci
npm run dev
```

## Anteprima web locale

Per provare l’interfaccia nel browser senza installare l’app desktop:

```sh
npm run preview:web
```

Apri l’indirizzo locale mostrato nel terminale (normalmente `http://127.0.0.1:5173`). La demo usa dati fittizi salvati solo nel browser e non accede al database desktop. Il barcode Proprietario dimostrativo è `0000000001`; dalla fascia in alto puoi ripristinare i dati iniziali. Le funzioni che dipendono da dispositivi o file locali sono limitate nella demo.

Su una nuova installazione desktop viene creato automaticamente un account Proprietario con un barcode casuale. Il barcode iniziale è salvato in `Accesso iniziale/Credenziali proprietario.txt` nella cartella di archivio (Documenti/Gestionale-Archivio per impostazione predefinita); conserva il file in modo sicuro e usalo per accedere dopo la scadenza dell’accesso temporaneo iniziale. Il codice di riconoscimento delle sedi è composto da 15 lettere e numeri.

Per creare manualmente l'installer Windows:

```sh
npm run dist:win
```

Il file `Gestione-Supermercato-Setup-<versione>.exe` viene generato nella cartella `release`.
La prima installazione attende tre minuti per completare la configurazione iniziale; gli aggiornamenti successivi non includono questa attesa.

## Dati e dispositivi

Il database SQLite viene salvato nella cartella dati utente di Windows e conserva prodotti, date di scadenza attivate, movimenti di magazzino, vendite, scontrini, promozioni e impostazioni. La sezione Magazzino include le pagine per il catalogo, lo storico dei carichi e scarichi e la registrazione di nuovi movimenti; Gestione sedi > Merce in esaurimento mostra le giacenze sotto soglia per ogni sede. Al primo avvio aggiornato, le vendite già archiviate vengono importate nello storico senza alterare le giacenze. La sezione Impostazioni > Archivio dati permette di scegliere dove salvare i report giornalieri in PDF, suddivisi in cartelle per Magazzino, Cassa, Vendite, Promozioni e Statistiche. La cartella `Accesso iniziale` viene trasferita quando si sceglie una nuova cartella di archivio. I vecchi file TXT con nome data nelle cartelle di backup vengono rimossi quando il backup giornaliero viene aggiornato. Dopo aver configurato la cartella, per modificarla è richiesta una conferma aggiuntiva. Il backup viene eseguito a mezzanotte; se il gestionale è chiuso, recupera i giorni mancanti al successivo avvio.

La sezione Dipendenti permette di registrare dati anagrafici e contrattuali, foto del dipendente e dei documenti e il contratto PDF. La password iniziale viene salvata come hash nel database locale; la lista è ricercabile ed esportabile in PDF, con una scheda per dipendente che include foto e dati anagrafici e contrattuali. Il Tracker Dipendenti registra gli accessi alle sezioni e le principali operazioni effettuate; consente di filtrare per periodo e dipendente, scaricare il registro e stamparlo. I buoni sconto generati includono un codice composto dal nome del negozio e da 10 cifre casuali, con il barcode corrispondente. I gruppi di buoni possono essere modificati o eliminati dalla lista.

Il Bilancio gestionale consente di filtrare gli ultimi 3 mesi, 6 mesi o un anno e di scaricare un PDF con la stessa grafica della schermata. La lista delle giacenze può essere salvata in PDF e allegata alle app di comunicazione dalla cartella in cui il file viene salvato.

I report delle vendite possono essere esportati in PDF o in un file Excel `.xlsx`, con larghezza delle colonne e intestazioni formattate per facilitarne la lettura.

Gli scontrini sono conservati per un mese e i movimenti di magazzino per un anno; i record più vecchi vengono eliminati all’avvio, ogni volta che si carica lo stato e automaticamente almeno ogni minuto mentre l’app è aperta. Per registrare una spesa è obbligatorio indicare la sede; le spese di affitto richiedono la ricevuta di pagamento allegata. Ogni punto fedeltà vale 0,10 €.

La sezione **Impostazioni > Dispositivi** permette di attivare il lettore barcode USB (i modelli che inviano i codici come tastiera sono riconosciuti alla prima lettura) e di collegare una stampante installata per la stampa diretta degli scontrini. La selezione della stampante e le preferenze del lettore restano salvate. La scansione di articoli sconosciuti in cassa chiede conferma prima di aprire il nuovo articolo; il codice acquisito viene inserito nel modulo ed è modificabile. Nelle pagine Vendite e Modifica o Elimina è possibile usare il lettore per cercare un numero di scontrino. La scansione tramite fotocamera è disponibile in Cassa, Vendite e Modifica o Elimina, se il dispositivo e i permessi la supportano. Gli articoli configurati a chilogrammi o litri richiedono l’inserimento del peso o del volume alla cassa e il relativo prezzo viene calcolato in base al prezzo unitario.

In sviluppo viene caricato un catalogo dimostrativo; l'installer parte con il magazzino vuoto.

## Release automatiche

Il workflow `.github/workflows/release.yml` crea un installer Windows e una GitHub Release per ogni push su qualsiasi branch. La versione viene incrementata usando il numero progressivo della run (`0.1.<run>`). Lo stesso workflow può essere avviato manualmente dalla scheda Actions.

Nel repository GitHub, abilita i permessi di scrittura per `GITHUB_TOKEN` in **Settings > Actions > General > Workflow permissions**. L'installer scaricabile si trova negli asset della release più recente.