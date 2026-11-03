import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import chess

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from validate_prepared_candidate import publish,checked_preparation,completed_dependency
from unittest.mock import patch


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        for directory in ('candidates','openings','bin','preparation'):(self.root/directory).mkdir()
        (self.root/'bin/engine.exe').write_bytes(b'frozen-native')
        board=chess.Board()
        old={'fen':board.fen(),'move':'e2e4','ponder':'e7e5','depth':26,'gapCp':0,'whiteCp':20}
        base={'schema':1,'maxPly':24,'entries':{'':old},'metadata':{}}
        self.write('openings/base.json',base)
        self.sha=hashlib.sha256((self.root/'openings/base.json').read_bytes()).hexdigest()
        self.ref={'id':'reference','engine':'bin/engine.exe','preparedRepertoire':'openings/base.json','preparedSha256':self.sha}
        self.write('candidates/registry.json',{'aliases':{'arthur-latest':'reference'},'candidates':[self.ref]})
        board.push_uci('e2e4');board.push_uci('e7e5')
        new={'fen':board.fen(),'move':'g1f3','ponder':'b8c6','depth':26,'gapCp':2,'whiteCp':18}
        self.data={**base,'entries':{'':old,'e2e4 e7e5':new},'metadata':{
            'inheritedRepertoireSha256':self.sha,
            'engineSha256':hashlib.sha256(b'frozen-native').hexdigest()}}
        self.write('preparation/repertoire.json',self.data)
        self.write('preparation/progress.json',{'completed':1,'planned':1})
        self.row={'history':['e2e4','e7e5'],'accepted':True,'selected':'g1f3','gapCp':2,
                  'checkDepth':26,'forcedDepth':26,'checkBound':False,'forcedBound':False}
        self.write('preparation/observations.json',{'rows':[self.row]})
    def tearDown(self):self.tmp.cleanup()
    def write(self,path,value):(self.root/path).write_text(json.dumps(value),encoding='utf8')
    def check(self):return checked_preparation(self.root/'preparation',self.ref,self.root,1)

    def test_experimental_publication_preserves_reference_alias_and_input(self):
        original=(self.root/'openings/base.json').read_bytes()
        candidate,reference=publish(self.root,'reference','test-next','Teste',self.root/'preparation',1)
        registry=json.loads((self.root/'candidates/registry.json').read_text())
        self.assertEqual(registry['aliases'],{'arthur-latest':'reference'})
        self.assertEqual((self.root/'openings/base.json').read_bytes(),original)
        self.assertEqual(reference,self.ref)
        self.assertEqual(hashlib.sha256((self.root/candidate['preparedRepertoire']).read_bytes()).hexdigest(),candidate['preparedSha256'])
        with self.assertRaisesRegex(ValueError,'já existe'):
            publish(self.root,'reference','test-next','Teste',self.root/'preparation',1)

    def test_incomplete_run_or_wrong_native_cannot_publish(self):
        self.write('preparation/progress.json',{'completed':0,'planned':1})
        with self.assertRaisesRegex(ValueError,'não concluiu'):self.check()
        self.write('preparation/progress.json',{'completed':1,'planned':1})
        (self.root/'bin/engine.exe').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'Motor'):self.check()
        self.assertFalse((self.root/'openings/test-next.json').exists())

    def test_inherited_mutation_and_unconfirmed_new_entry_are_rejected(self):
        self.data['entries']['']['whiteCp']=999;self.write('preparation/repertoire.json',self.data)
        with self.assertRaisesRegex(ValueError,'congelada'):self.check()
        self.data['entries']['']['whiteCp']=20;self.write('preparation/repertoire.json',self.data)
        self.row['forcedDepth']=25;self.write('preparation/observations.json',{'rows':[self.row]})
        with self.assertRaisesRegex(ValueError,'confirmações'):self.check()
        self.row['forcedDepth']=26;self.row['forcedBound']=True
        self.write('preparation/observations.json',{'rows':[self.row]})
        with self.assertRaisesRegex(ValueError,'confirmações'):self.check()

    def test_queue_requires_all_prior_games_and_consistent_events(self):
        good={'status':'finished','failures':0,'unfinishedGames':0,'warnings':[],
              'recordedGames':2,'plannedGames':2}
        with patch('validate_prepared_candidate.match_report',return_value=good):
            self.assertEqual(completed_dependency(self.root),good)
        for change in ({'recordedGames':1},{'failures':1},{'warnings':['PGN inconsistente']},
                       {'unfinishedGames':1},{'status':'running'}):
            with patch('validate_prepared_candidate.match_report',return_value={**good,**change}):
                with self.assertRaisesRegex(ValueError,'não terminou'):
                    completed_dependency(self.root)


if __name__=='__main__':unittest.main()
